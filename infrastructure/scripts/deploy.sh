#!/bin/bash
# ================================================
# WasslChat - Deployment Script
# ================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check required tools
check_requirements() {
    log_info "Checking requirements..."
    
    command -v docker >/dev/null 2>&1 || { log_error "Docker is required but not installed."; exit 1; }
    command -v doctl >/dev/null 2>&1 || { log_error "doctl is required but not installed."; exit 1; }
    command -v kubectl >/dev/null 2>&1 || { log_error "kubectl is required but not installed."; exit 1; }
    
    log_info "All requirements satisfied."
}

# Build and push Docker images
build_images() {
    local TAG=${1:-latest}
    log_info "Building Docker images with tag: $TAG"
    
    # Login to registry
    doctl registry login
    
    # Build API
    docker build -t registry.digitalocean.com/wasslchat/api:$TAG \
        -f infrastructure/docker/Dockerfile.api .
    docker push registry.digitalocean.com/wasslchat/api:$TAG
    
    # Build Worker
    docker build -t registry.digitalocean.com/wasslchat/worker:$TAG \
        -f infrastructure/docker/Dockerfile.worker .
    docker push registry.digitalocean.com/wasslchat/worker:$TAG
    
    # Build Dashboard
    docker build -t registry.digitalocean.com/wasslchat/dashboard:$TAG \
        -f infrastructure/docker/Dockerfile.dashboard .
    docker push registry.digitalocean.com/wasslchat/dashboard:$TAG
    
    log_info "Images built and pushed successfully."
}

# Deploy to Kubernetes
deploy_k8s() {
    local ENV=${1:-staging}
    local TAG=${2:-latest}
    
    log_info "Deploying to Kubernetes ($ENV) with tag: $TAG"
    
    # Get kubeconfig
    doctl kubernetes cluster kubeconfig save wasslchat-k8s
    
    # Apply base manifests
    kubectl apply -k infrastructure/kubernetes/base
    
    # Apply environment-specific manifests
    kubectl apply -k infrastructure/kubernetes/$ENV
    
    # Update image tags
    kubectl set image deployment/wasslchat-api \
        api=registry.digitalocean.com/wasslchat/api:$TAG \
        --namespace=$ENV
    
    kubectl set image deployment/wasslchat-worker \
        worker=registry.digitalocean.com/wasslchat/worker:$TAG \
        --namespace=$ENV
    
    # Wait for rollout
    kubectl rollout status deployment/wasslchat-api --namespace=$ENV --timeout=300s
    kubectl rollout status deployment/wasslchat-worker --namespace=$ENV --timeout=300s
    
    log_info "Deployment completed successfully."
}

# Run database migrations
run_migrations() {
    local ENV=${1:-staging}
    log_info "Running database migrations ($ENV)..."
    
    kubectl exec -it deployment/wasslchat-api --namespace=$ENV -- \
        npx prisma migrate deploy
    
    log_info "Migrations completed."
}

# Rollback deployment
rollback() {
    local ENV=${1:-staging}
    log_warn "Rolling back deployment ($ENV)..."
    
    kubectl rollout undo deployment/wasslchat-api --namespace=$ENV
    kubectl rollout undo deployment/wasslchat-worker --namespace=$ENV
    
    log_info "Rollback completed."
}

# Show deployment status
status() {
    local ENV=${1:-staging}
    log_info "Deployment status ($ENV):"
    
    kubectl get pods --namespace=$ENV -l app=wasslchat-api
    kubectl get pods --namespace=$ENV -l app=wasslchat-worker
    kubectl get services --namespace=$ENV
    kubectl get ingress --namespace=$ENV
}

# Show help
show_help() {
    echo "WasslChat Deployment Script"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  build [tag]           Build and push Docker images"
    echo "  deploy [env] [tag]    Deploy to Kubernetes"
    echo "  migrate [env]         Run database migrations"
    echo "  rollback [env]        Rollback deployment"
    echo "  status [env]          Show deployment status"
    echo "  full [env] [tag]      Full deployment (build + deploy + migrate)"
    echo ""
    echo "Environments: staging, production"
    echo ""
    echo "Examples:"
    echo "  $0 build v1.0.0"
    echo "  $0 deploy staging v1.0.0"
    echo "  $0 full production v1.0.0"
}

# Main
main() {
    check_requirements
    
    case "$1" in
        build)
            build_images "${2:-latest}"
            ;;
        deploy)
            deploy_k8s "${2:-staging}" "${3:-latest}"
            ;;
        migrate)
            run_migrations "${2:-staging}"
            ;;
        rollback)
            rollback "${2:-staging}"
            ;;
        status)
            status "${2:-staging}"
            ;;
        full)
            build_images "${3:-latest}"
            deploy_k8s "${2:-staging}" "${3:-latest}"
            run_migrations "${2:-staging}"
            ;;
        *)
            show_help
            ;;
    esac
}

main "$@"
