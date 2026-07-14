# Elasticsearch Zero-Downtime Reindex Design

## Goal

Make manual and scheduled Elasticsearch reindexing safe when the full dataset is too large for one bulk request. Search must remain available if reindexing fails.

## Scope

The manual admin reindex endpoint and the daily reindex timer will call the same backend reindex service. This change does not add change tracking for innovations updated while a reindex is running; the new index represents the database state read during that run.

## Index and alias model

The application will search through a stable alias, `ir-documents`. Each physical index will have a unique versioned name, such as `ir-documents-20260714-1200`.

The reindex flow is:

1. Create a new versioned index with the current Elasticsearch schema.
2. Read the current innovation documents from SQL Server.
3. Insert documents in batches of 500.
4. Refresh once after ingestion completes.
5. Validate the new index.
6. Atomically move the `ir-documents` alias to the new index.
7. Delete the previous physical index after the alias switch succeeds.

The old index remains active while the new index is being built. If any step before the alias switch fails, the incomplete new index is deleted and the old index remains available.

## Validation

The new index is valid only when:

- every bulk request reports zero item-level errors;
- the indexed document count matches the expected source count;
- a basic search/health check succeeds.

Validation failure must prevent alias switching.

## Bulk ingestion

Bulk requests will contain at most 500 documents. The implementation will track item-level failures and fail the reindex if any occur. Refreshing every batch is avoided; one refresh is performed after all batches.

## Configuration and infrastructure

Backend search reads and writes will use the alias name, not a physical index name. Update `terraform-transactional/modules/innovation-service/function-app.tf` so `ES_INNOVATION_INDEX_NAME` is `ir-documents` instead of the current physical index name. Terraform does not manage versioned indexes; the backend owns their lifecycle.

The first deployment must bootstrap the alias against the existing index or perform a controlled initial migration, because an alias cannot have the same name as an existing physical index.

## Cleanup and safety

Old physical indexes are removed only after a successful alias switch. Cleanup must not remove the index currently referenced by the alias. Failed runs must remove only their own incomplete versioned index.

## Testing

Tests will cover:

- successful 500-document batching;
- one final refresh rather than per-batch refresh;
- bulk item errors preventing alias switching;
- count mismatch preventing alias switching;
- failed reindex preserving the old alias target;
- successful alias switch and old-index cleanup;
- both manual and timer triggers invoking the shared service.
