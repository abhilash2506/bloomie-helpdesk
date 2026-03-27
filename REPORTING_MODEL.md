# Bloomie Reporting Model

## Objective
Provide operational, managerial, and executive visibility into employee support performance.

## Reporting Layers

### 1. Operational reports
- open tickets
- in-progress tickets
- SLA due today
- breach queue
- response backlog

### 2. Managerial reports
- category trends
- resolution time
- admin workload
- forum reuse
- Bloomie deflection estimate

### 3. Executive reports
- monthly ticket volume
- top recurring employee issues
- branch/location comparison
- SLA attainment
- self-service adoption
- knowledge coverage

## Core Metrics
- total tickets
- tickets by category
- tickets by priority
- average first response time
- average resolution time
- SLA breach rate
- repeat issue rate
- KB usage
- forum usage
- Bloomie usage
- escalated-from-Bloomie rate
- citation-backed answer rate

## Data Model

### report_snapshots
- `id`
- `tenant_id`
- `period_start`
- `period_end`
- `metric_name`
- `metric_value`
- `dimensions_json`

### event_facts
- normalized event stream for analytics

## Dashboards
- tenant admin dashboard
- founder/platform dashboard
- Bloomie trust dashboard
- sensitive-case dashboard

## Export Formats
- CSV
- PDF
- scheduled email digest

## Future
- cohort reports by property/location
- predictive category alerts
- anomaly detection for complaints, payroll spikes, access issues
