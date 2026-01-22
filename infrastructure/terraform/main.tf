# ================================================
# WasslChat - Digital Ocean Infrastructure
# Terraform Configuration
# ================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.30"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    endpoint                    = "fra1.digitaloceanspaces.com"
    key                         = "terraform/wasslchat/terraform.tfstate"
    bucket                      = "wasslchat-terraform-state"
    region                      = "us-east-1" # Required but ignored for DO Spaces
    skip_credentials_validation = true
    skip_metadata_api_check     = true
  }
}

# ================================================
# Variables
# ================================================

variable "do_token" {
  description = "Digital Ocean API Token"
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment (staging/production)"
  type        = string
  default     = "production"
}

variable "region" {
  description = "Digital Ocean region"
  type        = string
  default     = "fra1" # Frankfurt (closest to Egypt)
}

variable "domain" {
  description = "Domain name"
  type        = string
  default     = "wasslchat.com"
}

variable "db_size" {
  description = "Database instance size"
  type        = string
  default     = "db-s-2vcpu-4gb"
}

variable "k8s_node_size" {
  description = "Kubernetes node size"
  type        = string
  default     = "s-2vcpu-4gb"
}

variable "k8s_node_count" {
  description = "Number of Kubernetes nodes"
  type        = number
  default     = 3
}

# ================================================
# Provider Configuration
# ================================================

provider "digitalocean" {
  token = var.do_token
}

# ================================================
# VPC Network
# ================================================

resource "digitalocean_vpc" "wasslchat" {
  name     = "wasslchat-vpc-${var.environment}"
  region   = var.region
  ip_range = "10.10.0.0/16"
}

# ================================================
# Kubernetes Cluster
# ================================================

resource "digitalocean_kubernetes_cluster" "wasslchat" {
  name    = "wasslchat-k8s-${var.environment}"
  region  = var.region
  version = "1.28.2-do.0"
  vpc_uuid = digitalocean_vpc.wasslchat.id

  node_pool {
    name       = "default-pool"
    size       = var.k8s_node_size
    node_count = var.k8s_node_count
    auto_scale = true
    min_nodes  = 2
    max_nodes  = 10

    labels = {
      service = "wasslchat"
      env     = var.environment
    }

    tags = ["wasslchat", var.environment]
  }

  maintenance_policy {
    start_time = "04:00"
    day        = "sunday"
  }

  tags = ["wasslchat", var.environment]
}

# ================================================
# Container Registry
# ================================================

resource "digitalocean_container_registry" "wasslchat" {
  name                   = "wasslchat"
  subscription_tier_slug = "professional"
  region                 = var.region
}

resource "digitalocean_container_registry_docker_credentials" "wasslchat" {
  registry_name = digitalocean_container_registry.wasslchat.name
}

# ================================================
# Managed PostgreSQL Database
# ================================================

resource "digitalocean_database_cluster" "postgres" {
  name       = "wasslchat-db-${var.environment}"
  engine     = "pg"
  version    = "15"
  size       = var.db_size
  region     = var.region
  node_count = var.environment == "production" ? 2 : 1
  
  private_network_uuid = digitalocean_vpc.wasslchat.id

  maintenance_window {
    day  = "sunday"
    hour = "02:00:00"
  }

  tags = ["wasslchat", var.environment]
}

resource "digitalocean_database_db" "wasslchat" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = "wasslchat"
}

resource "digitalocean_database_user" "wasslchat" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = "wasslchat"
}

resource "digitalocean_database_firewall" "postgres" {
  cluster_id = digitalocean_database_cluster.postgres.id

  rule {
    type  = "k8s"
    value = digitalocean_kubernetes_cluster.wasslchat.id
  }
}

# ================================================
# Managed Redis
# ================================================

resource "digitalocean_database_cluster" "redis" {
  name       = "wasslchat-redis-${var.environment}"
  engine     = "redis"
  version    = "7"
  size       = "db-s-1vcpu-1gb"
  region     = var.region
  node_count = 1
  
  private_network_uuid = digitalocean_vpc.wasslchat.id

  tags = ["wasslchat", var.environment]
}

resource "digitalocean_database_firewall" "redis" {
  cluster_id = digitalocean_database_cluster.redis.id

  rule {
    type  = "k8s"
    value = digitalocean_kubernetes_cluster.wasslchat.id
  }
}

# ================================================
# Spaces (Object Storage)
# ================================================

resource "digitalocean_spaces_bucket" "media" {
  name   = "wasslchat-media-${var.environment}"
  region = var.region
  acl    = "private"

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["https://*.wasslchat.com"]
    max_age_seconds = 3600
  }

  lifecycle_rule {
    enabled = true
    prefix  = "temp/"
    expiration {
      days = 7
    }
  }
}

resource "digitalocean_cdn" "media" {
  origin         = digitalocean_spaces_bucket.media.bucket_domain_name
  custom_domain  = "cdn.${var.domain}"
  certificate_id = digitalocean_certificate.wasslchat.id
}

# ================================================
# Domain & SSL
# ================================================

resource "digitalocean_domain" "wasslchat" {
  name = var.domain
}

resource "digitalocean_certificate" "wasslchat" {
  name    = "wasslchat-cert-${var.environment}"
  type    = "lets_encrypt"
  domains = [
    var.domain,
    "*.${var.domain}"
  ]

  lifecycle {
    create_before_destroy = true
  }
}

resource "digitalocean_record" "api" {
  domain = digitalocean_domain.wasslchat.id
  type   = "A"
  name   = "api"
  value  = digitalocean_loadbalancer.wasslchat.ip
  ttl    = 300
}

resource "digitalocean_record" "app" {
  domain = digitalocean_domain.wasslchat.id
  type   = "A"
  name   = "app"
  value  = digitalocean_loadbalancer.wasslchat.ip
  ttl    = 300
}

resource "digitalocean_record" "dashboard" {
  domain = digitalocean_domain.wasslchat.id
  type   = "A"
  name   = "dashboard"
  value  = digitalocean_loadbalancer.wasslchat.ip
  ttl    = 300
}

# ================================================
# Load Balancer
# ================================================

resource "digitalocean_loadbalancer" "wasslchat" {
  name   = "wasslchat-lb-${var.environment}"
  region = var.region
  vpc_uuid = digitalocean_vpc.wasslchat.id

  forwarding_rule {
    entry_port     = 443
    entry_protocol = "https"

    target_port     = 80
    target_protocol = "http"

    certificate_name = digitalocean_certificate.wasslchat.name
  }

  forwarding_rule {
    entry_port     = 80
    entry_protocol = "http"

    target_port     = 80
    target_protocol = "http"
  }

  healthcheck {
    port     = 80
    protocol = "http"
    path     = "/health"
  }

  redirect_http_to_https = true
  
  droplet_tag = "wasslchat-${var.environment}"
}

# ================================================
# Monitoring & Alerts
# ================================================

resource "digitalocean_monitor_alert" "cpu_alert" {
  alerts {
    email = ["alerts@wasslchat.com"]
  }
  window      = "5m"
  type        = "v1/insights/droplet/cpu"
  compare     = "GreaterThan"
  value       = 80
  enabled     = true
  tags        = ["wasslchat", var.environment]
  description = "CPU usage is above 80% for 5 minutes"
}

resource "digitalocean_monitor_alert" "memory_alert" {
  alerts {
    email = ["alerts@wasslchat.com"]
  }
  window      = "5m"
  type        = "v1/insights/droplet/memory_utilization_percent"
  compare     = "GreaterThan"
  value       = 85
  enabled     = true
  tags        = ["wasslchat", var.environment]
  description = "Memory usage is above 85% for 5 minutes"
}

# ================================================
# Outputs
# ================================================

output "kubernetes_cluster_id" {
  value = digitalocean_kubernetes_cluster.wasslchat.id
}

output "kubernetes_endpoint" {
  value     = digitalocean_kubernetes_cluster.wasslchat.endpoint
  sensitive = true
}

output "database_uri" {
  value     = digitalocean_database_cluster.postgres.uri
  sensitive = true
}

output "database_private_uri" {
  value     = digitalocean_database_cluster.postgres.private_uri
  sensitive = true
}

output "redis_uri" {
  value     = digitalocean_database_cluster.redis.uri
  sensitive = true
}

output "redis_private_uri" {
  value     = digitalocean_database_cluster.redis.private_uri
  sensitive = true
}

output "load_balancer_ip" {
  value = digitalocean_loadbalancer.wasslchat.ip
}

output "spaces_endpoint" {
  value = digitalocean_spaces_bucket.media.bucket_domain_name
}

output "cdn_endpoint" {
  value = digitalocean_cdn.media.endpoint
}

output "registry_endpoint" {
  value = digitalocean_container_registry.wasslchat.endpoint
}
