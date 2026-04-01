# Personal Second Brain MVP Design

## 1. Overview

This document defines the MVP design for a single-user, privacy-first, local-first personal second brain application. The product combines four core capabilities in one system:

- **Knowledge**: notes, imported documents, structured personal knowledge
- **Q&A**: retrieval-augmented question answering with citations
- **Vault**: storage and controlled use of sensitive information
- **TODO**: lightweight action tracking tied back to knowledge and conversations

The product is optimized for daily personal use on one machine. It should feel like a desktop application, but keep a local web architecture internally so development stays fast and the core logic remains reusable.

### Product priorities

1. **Knowledge base + Q&A is the primary workflow**
2. **Sensitive information is a first-class domain, not an afterthought**
3. **TODOs are part of the knowledge-to-action loop**
4. **Everything stays local in the MVP**

## 2. MVP Scope

The MVP includes:

- Local single-user deployment
- Desktop-first user experience
- Local Python backend and local React frontend
- SQLite as the primary relational store
- Chroma as the vector store
- Knowledge import, note editing, semantic retrieval, and citation-backed Q&A
- A separate vault for sensitive information with encrypted storage
- Lightweight TODO management linked to knowledge and chat context
- Chat history with traceable context metadata
- Explicit per-question authorization for vault participation in AI context

The MVP does **not** include:

- Multi-user collaboration
- Cloud sync or cross-device conflict resolution
- Full password-manager parity with specialized tools
- Complex project management features
- Autonomous long-running agent workflows
- Fine-grained role-based access control

## 3. Architecture

### 3.1 Delivery model

The product uses a **local web application core wrapped in a desktop delivery experience**.

- A **Python backend** owns data access, retrieval, indexing, vault security, and model calls
- A **React frontend** owns navigation, views, forms, and interaction flows
- A **desktop launcher** starts the local backend and opens the local UI for normal use
- In development, frontend and backend may still run independently

This structure matches the current repository shape and keeps shipping simple without giving up desktop-oriented UX.

### 3.2 Runtime components

1. **Frontend UI**
   - Knowledge views
   - Q&A workspace
   - Vault views
   - TODO views
   - Settings / unlock / provider configuration

2. **Application backend**
   - CRUD APIs for notes, vault items, tasks, and chats
   - Retrieval orchestration
   - Prompt assembly
   - Authorization checks for sensitive context
   - Indexing jobs for knowledge ingestion

3. **Primary database (SQLite)**
   - Structured application records
   - Metadata and relationships
   - Chat history
   - Vault item metadata and encrypted payload references

4. **Vector store (Chroma)**
   - Embeddings for knowledge chunks
   - Optional embeddings for vault search, only if consistent with security rules

5. **AI provider integration**
   - Embedding generation
   - Answer generation
   - Future summarization or extraction flows

## 4. Core Domain Boundaries

### 4.1 Knowledge

The knowledge domain stores normal, non-sensitive information:

- personal notes
- imported documents
- curated excerpts
- summaries and synthesized notes
- tags and source metadata

Knowledge content is eligible for default search and default AI retrieval.

### 4.2 Q&A

The Q&A domain handles:

- question submission
- retrieval from allowed sources
- reranking and citation assembly
- answer generation
- chat history and traceability

Q&A is the main interaction layer over the knowledge base.

### 4.3 Vault

Vault is a separate domain for sensitive information such as:

- passwords
- API keys
- tokens
- login details
- private notes that should not behave like general knowledge

Vault is not modeled as “just another note type.” It has its own storage rules, unlock rules, and usage controls.

### 4.4 TODO

TODO is a lightweight action layer, not a full project-management product. It exists to capture:

- next actions
- reminders tied to notes or chat results
- follow-up work derived from reading or asking questions

Its job is to turn knowledge into action, not to compete with dedicated team PM tools.

## 5. Data Model

The MVP centers around five logical object families.

### 5.1 KnowledgeItem

Represents a note or imported knowledge object.

Suggested fields:

- `id`
- `title`
- `content`
- `source_type` (manual, file_import, web_clip, summary, etc.)
- `source_ref` (optional original path or URL metadata)
- `tags`
- `created_at`
- `updated_at`
- `index_status`

Supporting chunk/index records should track:

- owning `knowledge_item_id`
- chunk text
- chunk order
- embedding/vector-store identifiers
- optional offsets or page references

### 5.2 VaultItem

Represents a sensitive record.

Suggested fields:

- `id`
- `title`
- `category`
- `username` or `account_name`
- `secret` (encrypted)
- `url` or `service_name`
- `notes` (encrypted when sensitive)
- `created_at`
- `updated_at`

Vault records should support structured layouts rather than forcing everything into one blob field.

### 5.3 TaskItem

Represents a lightweight TODO.

Suggested fields:

- `id`
- `title`
- `description`
- `status`
- `priority`
- `due_at` (optional)
- `tags`
- `created_at`
- `updated_at`

### 5.4 ChatSession and ChatMessage

Represents question-answer history.

Suggested session fields:

- `id`
- `title` or generated summary
- `created_at`
- `updated_at`

Suggested message/request metadata:

- `session_id`
- `role`
- `content`
- `used_vault_context` (boolean)
- `retrieval_summary`
- `created_at`

### 5.5 Link / Reference records

Used for lightweight cross-domain relationships.

Examples:

- task linked to a knowledge item
- task linked to a chat session
- chat message linked to source citations
- vault item linked to a task when needed

This remains deliberately lightweight in the MVP. A graph-style relationship engine is out of scope.

## 6. Key User Flows

### 6.1 Knowledge ingestion

Users can create notes directly or import source material. The backend then:

1. stores the source as a `KnowledgeItem`
2. extracts or normalizes text
3. splits content into chunks
4. generates embeddings
5. writes vectors to Chroma
6. stores chunk-to-source traceability metadata

The system should clearly surface indexing success or failure.

### 6.2 Search and Q&A

When the user asks a question:

1. query embedding is generated
2. semantic search runs against allowed knowledge content
3. results are lightly reranked
4. prompt context is assembled from top results
5. the model returns an answer with citations
6. the conversation history stores both the answer and the retrieval metadata

Default behavior uses **Knowledge only**.

### 6.3 Vault interaction

Vault behaves like a lightweight password manager:

- users unlock the vault before sensitive operations
- list views may be visible while sensitive fields stay masked
- viewing a secret is an explicit action
- copying a secret is an explicit action
- editing sensitive fields is gated by the unlock state

The UI should reinforce that vault entries are treated differently from normal notes.

### 6.4 Vault authorization during Q&A

Vault content does **not** participate in AI by default.

For a question to use vault data:

1. the user explicitly enables vault participation for that question
2. the system verifies that the vault is currently unlocked
3. vault retrieval runs only for that request
4. vault-derived context is clearly separated in metadata
5. the conversation stores that vault content was used

This creates a clear audit trail and prevents silent leakage into prompts.

### 6.5 TODO creation and linking

Tasks may be created from:

- scratch
- a knowledge item
- a chat response

Tasks can link back to the note or conversation that produced them. This creates the main product loop:

**collect information → understand it → ask questions → extract action items**

## 7. Security Model

### 7.1 Security layers

The MVP separates information into three practical trust layers:

1. **General knowledge content**
   - searchable by default
   - usable by AI by default

2. **Sensitive vault content**
   - masked by default
   - encrypted at rest
   - unavailable to AI unless explicitly authorized per request

3. **Prompt assembly layer**
   - only content allowed by the current request may enter the model context

The important rule is:

> Being stored locally does not automatically make content eligible for model use.

### 7.2 Vault protection expectations

Vault should meet the expectations of a lightweight password vault in the MVP:

- sensitive fields are encrypted before persistent storage
- the vault has an unlock state separate from normal app navigation
- hidden fields stay hidden until explicitly revealed
- copying or revealing secrets is a deliberate action
- vault context is opt-in per question

### 7.3 Q&A permission boundary

All AI context assembly should pass through one shared authorization path.

That path must answer:

- Is the source general knowledge or vault content?
- Is the vault currently unlocked?
- Did the user explicitly authorize vault participation for this question?
- Which sources were ultimately included in the prompt?

No caller should bypass this boundary by directly reading vault records while building prompts.

## 8. Error Handling

The MVP should prefer errors that are clear, actionable, and recoverable.

### 8.1 Ingestion failures

If import, chunking, or embedding fails:

- keep the original record when possible
- mark indexing status clearly
- show which stage failed
- allow retry without duplicate record creation

### 8.2 Model failures

If answer generation fails:

- preserve the user’s question
- do not fabricate fallback answers
- show a retry path
- keep retrieval and provider failures distinguishable

### 8.3 Vault state failures

If a sensitive operation is attempted while the vault is locked:

- reject the action clearly
- instruct the user to unlock first
- do not silently downgrade behavior when the user explicitly asked to use vault content

### 8.4 Citation integrity failures

If a result cannot be traced back to a valid source, the system should avoid presenting it as a trustworthy citation. It is better to fail visibly than to show unsupported references.

## 9. Testing Strategy

The MVP test strategy should focus on trust-critical paths.

### 9.1 Knowledge tests

- note creation and document ingestion
- chunking behavior
- embedding/index writes
- retrieval returning valid citations

### 9.2 Q&A tests

- default retrieval excludes vault content
- prompt context contains only authorized sources
- answers include citation metadata when results exist
- no-result and provider-failure behavior is explicit

### 9.3 Vault tests

- encrypted fields are not persisted as plaintext
- locked vault blocks read/reveal/copy/edit operations
- unlocked vault permits intended actions only
- per-question vault authorization behaves correctly

### 9.4 TODO linkage tests

- tasks can be created directly
- tasks can be created from knowledge or chat context
- cross-links persist and load correctly

## 10. Current Repository Alignment

The current repository already supports several core building blocks:

- local backend configuration and runtime data directories
- local SQLite storage configuration
- a Chroma-backed retrieval pipeline
- a desktop launcher that opens the local application
- a React/Tailwind frontend scaffold

This means the MVP should evolve the existing architecture rather than replacing it. The main missing work is in domain modeling, secure vault behavior, richer APIs, and a coherent user-facing workflow across modules.

## 11. MVP Boundaries and Tradeoffs

This design deliberately favors:

- local trust over sync complexity
- explicit authorization over convenience for sensitive data
- traceable answers over opaque model responses
- lightweight task management over heavy PM features
- architecture reuse over early platform rewrites

The main tradeoff is that the MVP will not try to solve every “second brain” problem at once. It focuses on a trustworthy local knowledge system with controlled sensitive-data handling and a practical action loop.

## 12. Future Evolution

Natural next-step expansions after the MVP include:

- better importers and source-specific parsing
- smarter note summarization and tagging
- stronger vault item templates and expiration workflows
- richer conversational follow-up and answer refinement
- better task extraction from Q&A results
- eventual sync and multi-device support
- optional migration from SQLite to a central relational store if product scope expands

For now, the MVP should optimize for one thing: a dependable personal system that lets the user store knowledge, protect secrets, ask grounded questions, and turn insights into action.
