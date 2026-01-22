-- WasslChat Database Initialization
-- Creates additional databases for services

-- Evolution API database
CREATE DATABASE evolution;
GRANT ALL PRIVILEGES ON DATABASE evolution TO wasslchat;

-- Test database for CI
CREATE DATABASE wasslchat_test;
GRANT ALL PRIVILEGES ON DATABASE wasslchat_test TO wasslchat;

-- Enable required extensions
\c wasslchat;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\c evolution;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c wasslchat_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
