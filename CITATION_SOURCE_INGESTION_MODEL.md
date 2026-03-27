# Bloomie Citation and Source Ingestion Model

## Objective
Make Bloomie answers traceable, trustworthy, and maintainable.

## Supported Source Types
- Google Sheets
- Google Docs
- Drive folders
- uploaded PDFs
- SOP files
- policy documents
- misconduct/compliance handbooks
- internal KB articles

## Source Objects

### knowledge_sources
- `id`
- `tenant_id`
- `type`
- `title`
- `location`
- `status`
- `last_synced_at`
- `sync_frequency`
- `owner_user_id`
- `approval_status`

### knowledge_documents
- `id`
- `tenant_id`
- `source_id`
- `document_key`
- `title`
- `checksum`
- `version`
- `status`
- `parsed_at`

### knowledge_chunks
- `id`
- `tenant_id`
- `document_id`
- `chunk_index`
- `content`
- `tags`
- `embedding_ref` (optional later)

## Ingestion Flow
1. admin adds source
2. source enters `pending`
3. sync worker fetches document metadata/content
4. parser extracts clean text
5. chunker prepares searchable chunks
6. admin approves source or article
7. Bloomie uses approved chunks only

## Citation Model
Each Bloomie answer should return:
- answer text
- confidence score
- cited source list

Each citation should include:
- source title
- document title
- section or chunk reference
- last synced date
- source URL if allowed

## Answering Rules
- if confidence is low, Bloomie should say so
- if no approved source exists, Bloomie should recommend ticket routing
- if issue is sensitive, Bloomie should avoid public/forum path

## Source Health Monitoring
- last sync time
- failed sync count
- stale source warning
- parsing failure warning
- approval pending count

## Production Recommendation
- start with PostgreSQL full-text search
- add vector retrieval later if answer quality needs it
- never answer from unapproved or stale sources for critical categories
