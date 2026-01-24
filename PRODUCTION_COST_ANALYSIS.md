# BWC LMS - Production Cost Analysis & Architecture Blueprint

**Document Version:** 1.0  
**Date:** January 24, 2026  
**Prepared For:** Client Deployment to Play Store & App Store  
**Initial Users:** 3,500 → Scaling to 100,000 Users

---

## Executive Summary

This document provides a comprehensive production-level cost analysis for the Belgian Waffle Co. (BWC) Learning Management System (LMS). The application is a **feature-rich, AI-powered mobile LMS** built with React Native (Expo) and FastAPI backend, designed for employee training, assessments, and performance tracking.

---

## 1. Complete Feature Inventory (From Codebase Analysis)

### 1.1 Core Learning Features
| Feature | Description | Resource Impact |
|---------|-------------|-----------------|
| **Video-Based Courses** | Upload, stream, and track completion of training videos | High (Storage + CDN) |
| **Learning Paths** | Self-learning & career progression paths with node-based structure | Medium (DB) |
| **Quiz System** | Manual + AI-generated quizzes with scoring | Medium (AI API) |
| **Proctored Assessments** | Camera-monitored exams with breach detection | High (Storage for recordings) |
| **Interactive Simulations** | Branching video scenarios with decision tracking | High (Storage + Processing) |
| **Flashcards** | AI-powered study cards | Low (AI API) |
| **XP & Gamification** | Points, badges, leaderboards | Low (DB) |
| **Level Progression** | Waffler → Silver → Gold → Shift Manager | Low (DB) |

### 1.2 AI-Powered Features
| Feature | AI Service Used | Cost Factor |
|---------|-----------------|-------------|
| **AI Chatbot** | Groq (LLaMA 3.3-70B) | Pay per token |
| **Voice Query** | Whisper (Transcription) + Groq | High (Audio processing) |
| **Quiz Generation** | Groq (from transcripts/content) | Medium |
| **AI Roleplay Training** | Groq + ElevenLabs TTS | High (Audio synthesis) |
| **Course Recommendations** | Groq + Sentence Transformers | Medium |
| **Content Translation** | Groq | Medium |
| **AI Executive Summary** | Groq | Low |

### 1.3 Administrative Features
| Feature | Description | Resource Impact |
|---------|-------------|-----------------|
| **User Management** | Create/edit users with role-based privileges | Low (DB) |
| **Hierarchy Management** | Organizational structure with 11 levels | Low (DB) |
| **Access Control** | Role-based course visibility | Low (DB) |
| **Bulk Upload** | Excel/CSV import for users, content, assessments | Medium (Processing) |
| **Audit Logs** | Track all administrative actions | Medium (DB Storage) |
| **Content Library** | Manage PDFs, videos, images | High (Storage) |

### 1.4 Real-Time Features
| Feature | Description | Resource Impact |
|---------|-------------|-----------------|
| **WebSocket Notifications** | Real-time push to all connected clients | High (Concurrent connections) |
| **Live Location Tracking** | GPS tracking for field staff | Medium (Frequent writes) |
| **Virtual Meetings** | Video conferencing with room management | High (WebRTC/3rd party) |
| **Scheduled Exams** | Attendance + online exam system | Medium (DB) |

### 1.5 Analytics & Reporting
| Feature | Description | Resource Impact |
|---------|-------------|-----------------|
| **Advanced Analytics Dashboard** | Store & employee performance | Medium (Query-heavy) |
| **Training Effectiveness** | Course completion rates, scores | Low (DB) |
| **Hygiene Compliance** | Audit scoring system | Low (DB) |
| **CRM Tickets** | Customer complaint training workflow | Low (DB) |

---

## 2. Current Technology Stack

### 2.1 Frontend (Mobile App)
- **Framework:** React Native with Expo SDK 54
- **Navigation:** React Navigation 7
- **Key Libraries:**
  - `expo-av` - Audio/Video playback
  - `expo-camera` - Proctoring
  - `expo-location` - GPS tracking
  - `react-native-maps` - Location visualization
  - `react-native-webview` - Meeting room embedding
  - `react-native-chart-kit` - Analytics charts

### 2.2 Backend
- **Framework:** FastAPI (Python 3.x)
- **Database:** PostgreSQL (Neon - Serverless)
- **ORM:** SQLAlchemy 2.0
- **AI Models:**
  - Whisper (Local) - Speech-to-Text
  - SentenceTransformers (Local) - RAG embeddings
  - FAISS (Local) - Vector search
- **External APIs:**
  - Groq - LLM (LLaMA 3.3-70B)
  - ElevenLabs - Text-to-Speech

### 2.3 Current Storage
- **Local Filesystem:** `uploads/` directory (NOT production-ready)
- **Database:** Neon PostgreSQL (Serverless tier)

---

## 3. Production Architecture Requirements

### 3.1 Critical Changes Required for Production

| Current State | Required Change | Priority |
|---------------|-----------------|----------|
| In-memory stores (`users_store`, `meetings_store`, etc.) | Full PostgreSQL persistence | **CRITICAL** |
| Local `uploads/` folder | AWS S3 or Google Cloud Storage | **CRITICAL** |
| No load balancing | Multiple backend instances + Load Balancer | HIGH |
| Whisper running locally | OpenAI API or dedicated GPU server | HIGH |
| No Redis | Redis for WebSocket scaling + caching | HIGH |
| No CDN | CloudFront/CloudFlare for video delivery | HIGH |
| HTTP only | HTTPS with SSL certificates | **CRITICAL** |
| No monitoring | APM (DataDog/New Relic) + Error tracking | MEDIUM |

### 3.2 Recommended Production Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │                    CDN (CloudFront)              │
                    │     [Video Cache + Static Asset Distribution]    │
                    └─────────────────────────────────────────────────┘
                                           │
                    ┌─────────────────────────────────────────────────┐
                    │              Load Balancer (ALB/Nginx)          │
                    │          [SSL Termination + Health Checks]       │
                    └─────────────────────────────────────────────────┘
                           │              │              │
              ┌────────────┴──────────────┴──────────────┴────────────┐
              │                                                        │
    ┌─────────▼─────────┐   ┌─────────▼─────────┐   ┌─────────▼─────────┐
    │   FastAPI Pod 1   │   │   FastAPI Pod 2   │   │   FastAPI Pod N   │
    │   [App Server]    │   │   [App Server]    │   │   [App Server]    │
    └─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘
              │                       │                       │
              └───────────────────────┼───────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
    ┌─────────▼─────────┐   ┌─────────▼─────────┐   ┌─────────▼─────────┐
    │   PostgreSQL      │   │      Redis        │   │    AWS S3         │
    │   [Primary DB]    │   │  [Cache + PubSub] │   │   [File Storage]  │
    └───────────────────┘   └───────────────────┘   └───────────────────┘
```

---

## 4. Detailed Cost Analysis by User Tier

### 4.1 Tier 1: 3,500 Users (Initial Launch)

#### Infrastructure Costs

| Service | Specification | Provider Options | Monthly Cost (USD) |
|---------|---------------|------------------|-------------------|
| **Compute (Backend)** | 2x 2vCPU, 4GB RAM | AWS EC2 t3.medium / DigitalOcean | $60 - $80 |
| **Load Balancer** | Application LB | AWS ALB / Nginx | $20 - $30 |
| **Database** | 4GB RAM, 2vCPU, 60GB | Neon Pro / AWS RDS db.t3.medium | $50 - $100 |
| **Redis Cache** | 1GB RAM | Redis Cloud / AWS ElastiCache | $15 - $25 |
| **Object Storage (S3)** | 500GB estimated | AWS S3 Standard | $12 - $15 |
| **CDN (Video Delivery)** | 3TB egress/month | CloudFront / Cloudflare | $150 - $250 |
| **SSL Certificate** | Wildcard SSL | Let's Encrypt (Free) / AWS ACM | $0 |

**Infrastructure Subtotal:** $307 - $500/month

#### AI & External Services

| Service | Usage Estimate | Monthly Cost (USD) |
|---------|----------------|-------------------|
| **Groq API (LLM)** | ~2M tokens/month (est. 500 queries/day) | $40 - $80 |
| **ElevenLabs TTS** | ~100K characters/month | $22 (Starter) - $99 (Creator) |
| **OpenAI Whisper API** | 500 audio minutes/month | $15 - $30 |
| **Push Notifications** | Firebase (Free tier) / OneSignal | $0 - $99 |

**AI Services Subtotal:** $77 - $308/month

#### DevOps & Monitoring

| Service | Purpose | Monthly Cost (USD) |
|---------|---------|-------------------|
| **Error Tracking** | Sentry | $0 (Free tier) - $26 |
| **APM Monitoring** | DataDog / New Relic | $0 (Free tier) - $50 |
| **Log Management** | CloudWatch / Papertrail | $10 - $30 |
| **CI/CD** | GitHub Actions / GitLab | $0 (Free tier) |

**DevOps Subtotal:** $10 - $106/month

#### **TIER 1 TOTAL: $394 - $914/month**

---

### 4.2 Tier 2: 7,000 Users (Growth Phase)

#### Infrastructure Costs

| Service | Specification | Monthly Cost (USD) |
|---------|---------------|-------------------|
| **Compute (Backend)** | 4x 2vCPU, 4GB RAM | $120 - $160 |
| **Load Balancer** | Application LB | $25 - $35 |
| **Database** | 8GB RAM, 4vCPU, 150GB | $100 - $200 |
| **Redis Cache** | 2GB RAM, Cluster mode | $30 - $50 |
| **Object Storage (S3)** | 1TB estimated | $24 - $30 |
| **CDN (Video Delivery)** | 6TB egress/month | $300 - $500 |
| **Backup Storage** | Automated DB backups | $15 - $25 |

**Infrastructure Subtotal:** $614 - $1,000/month

#### AI & External Services

| Service | Usage Estimate | Monthly Cost (USD) |
|---------|----------------|-------------------|
| **Groq API (LLM)** | ~5M tokens/month | $100 - $200 |
| **ElevenLabs TTS** | ~250K characters/month | $99 (Creator) |
| **OpenAI Whisper API** | 1,200 audio minutes/month | $36 - $72 |
| **Push Notifications** | OneSignal Growth | $99 - $149 |

**AI Services Subtotal:** $334 - $520/month

#### DevOps & Monitoring

| Service | Purpose | Monthly Cost (USD) |
|---------|---------|-------------------|
| **Error Tracking** | Sentry Team | $26 - $80 |
| **APM Monitoring** | DataDog Pro | $50 - $100 |
| **Log Management** | Enhanced logging | $30 - $50 |

**DevOps Subtotal:** $106 - $230/month

#### **TIER 2 TOTAL: $1,054 - $1,750/month**

---

### 4.3 Tier 3: 15,000 Users

| Category | Monthly Cost (USD) |
|----------|-------------------|
| **Infrastructure** | $1,200 - $1,800 |
| **AI Services** | $500 - $800 |
| **DevOps & Monitoring** | $150 - $300 |
| **CDN (12TB egress)** | $600 - $900 |

#### **TIER 3 TOTAL: $2,450 - $3,800/month**

---

### 4.4 Tier 4: 35,000 Users

| Category | Monthly Cost (USD) |
|----------|-------------------|
| **Infrastructure (Kubernetes)** | $2,500 - $3,500 |
| **Database (Multi-AZ HA)** | $400 - $600 |
| **AI Services** | $1,200 - $2,000 |
| **DevOps & Monitoring** | $300 - $500 |
| **CDN (30TB egress)** | $1,500 - $2,200 |

#### **TIER 4 TOTAL: $5,900 - $8,800/month**

---

### 4.5 Tier 5: 70,000 Users

| Category | Monthly Cost (USD) |
|----------|-------------------|
| **Infrastructure (K8s Auto-scaling)** | $4,500 - $6,000 |
| **Database (RDS Multi-AZ + Read Replica)** | $800 - $1,200 |
| **AI Services (Consider self-hosted)** | $2,500 - $4,000 |
| **DevOps & Monitoring (Enterprise)** | $500 - $800 |
| **CDN (60TB egress)** | $3,000 - $4,500 |

#### **TIER 5 TOTAL: $11,300 - $16,500/month**

---

### 4.6 Tier 6: 100,000 Users (Enterprise Scale)

| Category | Specification | Monthly Cost (USD) |
|----------|---------------|-------------------|
| **Compute** | 15-25 pods, 4vCPU, 8GB each | $6,000 - $8,000 |
| **Database** | RDS m6g.xlarge + 2 Read Replicas | $1,200 - $1,800 |
| **Redis** | ElastiCache Cluster (3 nodes) | $400 - $600 |
| **Object Storage** | 5TB + Lifecycle rules | $120 - $150 |
| **CDN** | 100TB egress/month | $5,000 - $7,500 |
| **AI (Self-Hosted GPU)** | 2x g5.xlarge for Whisper/Embeddings | $3,000 - $4,000 |
| **Groq API** | ~20M tokens/month | $800 - $1,200 |
| **ElevenLabs** | 1M+ characters or Enterprise | $330 - $500 |
| **Monitoring (Enterprise)** | DataDog/New Relic Enterprise | $800 - $1,200 |
| **Security** | WAF, DDoS Protection | $200 - $400 |
| **Backup & DR** | Cross-region replication | $300 - $500 |

#### **TIER 6 TOTAL: $18,150 - $25,850/month**

---

## 5. One-Time & Recurring Platform Costs

### App Store Fees

| Platform | Cost | Frequency |
|----------|------|-----------|
| **Google Play Store** | $25 | One-time |
| **Apple App Store** | $99 | Annual |

### Development Tools (Optional)

| Tool | Purpose | Monthly Cost |
|------|---------|-------------|
| **Expo EAS Build** | Cloud builds for iOS/Android | $99 (Production tier) |
| **GitHub Enterprise** | Private repos + Actions | $21/user/month |
| **Figma** | Design system | Free - $45/user |

---

## 6. Cost Optimization Strategies

### 6.1 Immediate Savings (No Performance Impact)

| Strategy | Potential Savings |
|----------|------------------|
| **Reserved Instances (AWS)** | 30-40% off compute |
| **Spot Instances for Dev/Test** | 60-70% off |
| **S3 Intelligent Tiering** | 10-20% on storage |
| **CloudFront Reserved Capacity** | 30% on CDN |

### 6.2 Architecture Optimizations

| Strategy | Impact |
|----------|--------|
| **Video Transcoding to HLS** | 40-60% CDN bandwidth reduction |
| **Aggressive Caching (Redis)** | 50% DB query reduction |
| **Lazy Loading on Frontend** | Reduced initial data transfer |
| **WebP/AVIF for Images** | 30% storage reduction |

### 6.3 AI Cost Optimization

| Current | Optimized | Savings |
|---------|-----------|---------|
| Whisper (Local/API) | Cheaper alternatives (AssemblyAI) | 20-40% |
| Groq per-request | Batch processing where possible | 30% |
| ElevenLabs TTS | Use only for critical features | 50% |

---

## 7. Summary Cost Table

| User Tier | Monthly Low | Monthly High | Per-User Cost |
|-----------|-------------|--------------|---------------|
| **3,500** | $394 | $914 | $0.11 - $0.26 |
| **7,000** | $1,054 | $1,750 | $0.15 - $0.25 |
| **15,000** | $2,450 | $3,800 | $0.16 - $0.25 |
| **35,000** | $5,900 | $8,800 | $0.17 - $0.25 |
| **70,000** | $11,300 | $16,500 | $0.16 - $0.24 |
| **100,000** | $18,150 | $25,850 | $0.18 - $0.26 |

**Note:** Per-user cost remains relatively stable at $0.15-$0.26 due to economies of scale.

---

## 8. Recommended Hosting Providers

### Best for Cost-Efficiency (India-focused)

| Provider | Strengths | Best For |
|----------|-----------|----------|
| **AWS Mumbai (ap-south-1)** | Full ecosystem, lowest latency for Indian users | Enterprise, 15K+ users |
| **DigitalOcean Mumbai** | Simple, predictable pricing | Startups, <15K users |
| **Render.com** | Easy deployment, good free tier | MVP/Testing |
| **Neon** | Serverless PostgreSQL, auto-scaling | All tiers (already in use) |
| **Cloudflare** | Free CDN tier, low cost bandwidth | CDN optimization |

### Recommended Stack (3,500-7,000 Users)

```
Frontend:       Expo/React Native → Play Store + App Store
Backend:        2-4x DigitalOcean Droplets ($48-$96/mo)
Load Balancer:  DigitalOcean LB ($12/mo)
Database:       Neon Pro ($69/mo)
Cache:          Redis Cloud Free → Pro ($0-$30/mo)
Storage:        AWS S3 ($12/mo)
CDN:            Cloudflare Pro ($20/mo) + S3
AI:             Groq API + ElevenLabs Starter
```

---

## 9. Production Readiness Checklist

### Critical (Before Launch)

- [ ] Migrate all in-memory stores to PostgreSQL
- [ ] Move file uploads to AWS S3
- [ ] Implement HTTPS with SSL certificates
- [ ] Set up load balancer with health checks
- [ ] Configure Redis for WebSocket broadcasting
- [ ] Set up automated database backups
- [ ] Implement proper error handling and logging
- [ ] Configure CORS for production domains

### Important (Week 1)

- [ ] Set up monitoring (DataDog/New Relic)
- [ ] Configure error tracking (Sentry)
- [ ] Set up CI/CD pipeline
- [ ] Implement rate limiting
- [ ] Configure CDN caching rules
- [ ] Set up staging environment

### Recommended (Month 1)

- [ ] Performance testing with k6/Locust
- [ ] Security audit (OWASP compliance)
- [ ] Database query optimization
- [ ] Video transcoding pipeline (HLS)
- [ ] Implement blue-green deployments

---

## 10. Contact & Support

This analysis was prepared based on a comprehensive review of the BWC LMS codebase including:
- `server.py` (437KB, 11,065 lines - Backend API)
- `models.py` (545 lines - Database schema)
- 23 Screen components
- 41 Component modules
- Package dependencies analysis

For implementation support, the following areas require specialized attention:
1. **AWS S3 Migration** - Replace local `uploads/` folder
2. **Database Migration** - Remove all in-memory stores
3. **Redis Integration** - WebSocket scaling
4. **Kubernetes Setup** - For 35K+ users

---

*Document generated on January 24, 2026*
