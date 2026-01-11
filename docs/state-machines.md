# State Machine Diagrams

This document contains state machine diagrams for the key components in the Ballroom application.

---

## 1. Initial Sync Task (`initialSyncTask`)

Trigger.dev task for the first full sync after onboarding.

```mermaid
stateDiagram-v2
    [*] --> Starting: trigger({ userId })
    
    Starting --> Syncing: metadata.set('status', 'syncing')
    
    Syncing --> Completed: fullSync() succeeds
    Syncing --> Failed_Auth: AuthenticationError
    Syncing --> Failed_Quota: QUOTA_EXCEEDED
    Syncing --> Failed_Retry: Other errors
    
    Failed_Auth --> [*]: AbortTaskRunError (no retry)
    Failed_Quota --> [*]: AbortTaskRunError (no retry)
    Failed_Retry --> Syncing: Retry (max 3 attempts)
    Failed_Retry --> [*]: Max retries exceeded
    
    Completed --> [*]: Return sync result

    note right of Starting
        Tags: user:{userId}, sync-type:initial
        Max duration: 600s
    end note
    
    note right of Completed
        Sets metadata:
        - videosSynced
        - newVideos
        - existingVideos
        - unlikedVideos
        - reachedEnd
    end note
```

---

## 2. Incremental Sync Task (`incrementalSyncTask`)

Trigger.dev task for hourly incremental syncs.

```mermaid
stateDiagram-v2
    [*] --> Starting: trigger({ userId })
    
    Starting --> Syncing: metadata.set('status', 'syncing')
    
    Syncing --> Completed: quickSync() succeeds
    Syncing --> Failed_Auth: AuthenticationError
    Syncing --> Failed_Quota: QUOTA_EXCEEDED
    Syncing --> Failed_Retry: Other errors
    
    Failed_Auth --> [*]: AbortTaskRunError (no retry)
    Failed_Quota --> [*]: AbortTaskRunError (no retry)
    Failed_Retry --> Syncing: Retry (max 3 attempts)
    Failed_Retry --> [*]: Max retries exceeded
    
    Completed --> [*]: Return sync result

    note right of Starting
        Tags: user:{userId}, sync-type:incremental
        Concurrency limit: 5
        Max duration: 300s
    end note
```

---

## 3. Hourly Sync Schedule (`hourlySyncSchedule`)

Scheduled task that runs every hour and triggers incremental syncs for all onboarded users.

```mermaid
stateDiagram-v2
    [*] --> FetchingUsers: Cron trigger (0 * * * *)
    
    FetchingUsers --> ProcessingBatches: Users found
    FetchingUsers --> Completed: No onboarded users
    
    ProcessingBatches --> ProcessingBatches: More users to process
    ProcessingBatches --> Completed: All users processed
    ProcessingBatches --> Failed: Error during batch
    
    state ProcessingBatches {
        [*] --> FetchBatch
        FetchBatch --> TriggerBatch: Got user batch (500 max)
        TriggerBatch --> UpdateMetadata: batchTrigger()
        UpdateMetadata --> FetchBatch: More users exist
        UpdateMetadata --> [*]: End of users
    }
    
    Failed --> ProcessingBatches: Retry (max 2 attempts)
    Failed --> [*]: Max retries exceeded
    
    Completed --> [*]: Return summary

    note right of FetchingUsers
        Tags: scheduled-sync, date:YYYY-MM-DD, hour:H
        Max duration: 1800s (30 min)
    end note
    
    note right of ProcessingBatches
        Batch size: 500 users
        Triggers incrementalSyncTask
        for each user
    end note
```

---

## 4. Progressive Sync Algorithm (`progressiveSync`)

Core sync logic used by both initial and incremental syncs.

```mermaid
stateDiagram-v2
    [*] --> Initialize
    
    Initialize --> FetchPage: totalFetched < maxDepth
    Initialize --> MarkUnliked: totalFetched >= maxDepth
    
    FetchPage --> ProcessBatch: Videos returned
    FetchPage --> MarkUnliked: No videos (reachedEnd = true)
    
    ProcessBatch --> CheckExisting: Query existing videos
    
    CheckExisting --> InsertNew: Filter new videos
    
    InsertNew --> UpdateExisting: Insert to DB
    
    UpdateExisting --> CheckQuota: Update lastSeenAt
    
    CheckQuota --> CheckContinue: Quota OK
    CheckQuota --> [*]: QUOTA_EXCEEDED error
    
    state CheckContinue {
        [*] --> CheckPageToken
        CheckPageToken --> StopNoMorePages: No nextPageToken
        CheckPageToken --> CheckThreshold: Has nextPageToken
        
        CheckThreshold --> StopConsecutiveExisting: consecutiveExistingBatches >= 3
        CheckThreshold --> Continue: Still finding new videos
        
        StopNoMorePages --> [*]: reachedEnd = true
        StopConsecutiveExisting --> [*]: reachedEnd = false
        Continue --> [*]: Continue fetching
    }
    
    CheckContinue --> FetchPage: Continue
    CheckContinue --> MarkUnliked: Stop (reachedEnd = true)
    CheckContinue --> Complete: Stop (reachedEnd = false)
    
    MarkUnliked --> Complete: Mark old videos as unliked
    
    Complete --> [*]: Return SyncResult

    note right of Initialize
        Quick: initialLimit = 100
        Extended: initialLimit = 500
        Full: initialLimit = maxDepth
    end note
    
    note right of ProcessBatch
        Batch size: 50 videos
        consecutiveExistingBatches
        resets when new videos found
    end note
```

---

## 5. SyncButton Component State

Client-side state machine for the sync UI controls.

```mermaid
stateDiagram-v2
    [*] --> Idle
    
    state Idle {
        [*] --> Ready
        Ready --> QuotaLow: categorize.remaining < 20%
        QuotaLow --> QuotaExceeded: categorize.remaining = 0
    }
    
    Idle --> Syncing_Quick: Click "Sync" or "Quick Sync"
    Idle --> Syncing_Extended: Click "Extended Sync"
    Idle --> Syncing_Full: Click "Full Sync" (dev only)
    Idle --> Categorizing: Click "Categorize"
    
    Syncing_Quick --> SyncSuccess: API 200
    Syncing_Quick --> SyncError: API error
    
    Syncing_Extended --> SyncSuccess: API 200
    Syncing_Extended --> SyncError: API error
    
    Syncing_Full --> BackgroundStarted: API 200
    Syncing_Full --> SyncError: API error
    
    BackgroundStarted --> Idle: After 5s timeout
    
    SyncSuccess --> ShowStatus: Update status message
    SyncError --> ShowStatus: Show error message
    
    ShowStatus --> Idle: After 3s timeout
    
    Categorizing --> CategorizeSuccess: API 200
    Categorizing --> CategorizeError: API error
    
    CategorizeSuccess --> ShowStatus
    CategorizeError --> ShowStatus

    note right of Idle
        Displays:
        - Last sync time
        - Categorize quota badge
    end note
    
    note right of Syncing_Quick
        Status: "Quick sync in progress..."
        Calls: POST /api/youtube/sync
    end note
    
    note right of Categorizing
        Status: "Categorizing videos with AI..."
        Calls: POST /api/categorize
        Disabled when quota exceeded
    end note
```

---

## 6. Onboarding Client State

State machine for the onboarding flow.

```mermaid
stateDiagram-v2
    [*] --> Editing
    
    state Editing {
        [*] --> EmptyCategories
        
        EmptyCategories --> HasCategories: Add category
        HasCategories --> HasCategories: Add more (max 20)
        HasCategories --> EmptyCategories: Remove all
        
        state HasCategories {
            [*] --> ValidState
            ValidState --> MaxReached: categories.length >= 20
        }
    }
    
    Editing --> Submitting: Click "Start Organizing"
    
    note left of Submitting
        Requires: categories.length > 0
    end note
    
    Submitting --> Success: API 200
    Submitting --> Error: API error
    
    Success --> Redirecting: toast.success()
    Redirecting --> [*]: router.push('/dashboard')
    
    Error --> Editing: toast.error(), retain categories

    note right of Editing
        Can add via:
        - Text input + Enter/button
        - Click suggested category
        
        Validation:
        - No duplicates (case-insensitive)
        - Max 20 categories
        - Non-empty after trim
    end note
```

---

## 7. Dashboard Client State

State machine for the main dashboard view.

```mermaid
stateDiagram-v2
    [*] --> Initialize
    
    Initialize --> Loading: Mount component
    
    Loading --> HasVideos: Videos fetched
    Loading --> EmptyState: No videos
    Loading --> Error: Fetch failed
    
    state HasVideos {
        [*] --> DisplayingVideos
        
        DisplayingVideos --> FilteringByCategory: Select category
        DisplayingVideos --> Searching: Type in search
        DisplayingVideos --> ChangingPage: Click pagination
        
        FilteringByCategory --> Loading: Fetch with categoryId
        Searching --> Loading: Debounced fetch (300ms)
        ChangingPage --> Loading: Fetch with page param
    }
    
    state EmptyState {
        [*] --> NoVideosAtAll
        NoVideosAtAll --> NoSearchResults: Has search query
        NoSearchResults --> NoFilterResults: Has category filter
    }
    
    Error --> Loading: Retry
    
    HasVideos --> Syncing: Click Sync
    EmptyState --> Syncing: Click Sync
    
    Syncing --> Loading: onSyncComplete → refresh
    
    HasVideos --> Categorizing: Click Categorize
    Categorizing --> Loading: onCategorizeComplete → refresh
    
    HasVideos --> ManagingCategories: Open CategoryManager
    ManagingCategories --> Loading: Category added/deleted → refresh

    note right of Loading
        Params tracked in URL:
        - ?page=N
        - ?search=query
        
        State tracked locally:
        - selectedCategory
        - categoryCounts
    end note
    
    note right of HasVideos
        Grid display:
        - 24 videos per page
        - Responsive columns
        - Floating pagination
    end note
```

---

## 8. Video Sync Status Flow (Database)

State machine for video `syncStatus` field in the database.

```mermaid
stateDiagram-v2
    [*] --> Active: New video inserted
    
    Active --> Active: Seen in sync (lastSeenAt updated)
    Active --> Unliked: Not seen in full sync
    
    Unliked --> Active: Re-liked by user (seen in next sync)
    
    note right of Active
        syncStatus = 'active'
        Video appears in user's dashboard
    end note
    
    note right of Unliked
        syncStatus = 'unliked'
        Video hidden from dashboard
        Only set when reachedEnd = true
    end note
```

---

## 9. Error Handling Flow (Sync Tasks)

Decision tree for handling errors in sync tasks.

```mermaid
stateDiagram-v2
    [*] --> CatchError
    
    CatchError --> CheckAuthError: Is AuthenticationError?
    
    CheckAuthError --> AuthError: Yes
    CheckAuthError --> CheckQuotaError: No
    
    AuthError --> SetAuthMetadata: Set errorType, authErrorType
    SetAuthMetadata --> Abort: AbortTaskRunError
    
    CheckQuotaError --> QuotaError: Is QUOTA_EXCEEDED?
    CheckQuotaError --> RetriableError: No
    
    QuotaError --> SetQuotaMetadata: Set errorType = quota_exceeded
    SetQuotaMetadata --> Abort: AbortTaskRunError
    
    RetriableError --> SetRetryMetadata: Set errorType = retriable_error
    SetRetryMetadata --> ThrowError: Re-throw for retry
    
    Abort --> [*]: Task ends, no retry
    ThrowError --> [*]: Trigger.dev handles retry

    note right of AuthError
        Auth errors that abort:
        - INVALID_TOKEN
        - REFRESH_FAILED
        - NO_GOOGLE_ACCOUNT
        - NO_REFRESH_TOKEN
    end note
    
    note right of RetriableError
        Retried up to 3 times with
        exponential backoff:
        - min: 2-5s
        - max: 15-30s
        - factor: 2
    end note
```

---

## Component Interaction Overview

High-level flow showing how components interact:

```mermaid
flowchart TB
    subgraph Client ["Client (Browser)"]
        OB[Onboarding Client]
        DB[Dashboard Client]
        SB[SyncButton]
    end
    
    subgraph API ["API Routes"]
        OBC[/api/onboarding/complete]
        SYNC[/api/youtube/sync]
        FSYNC[/api/youtube/full-sync]
        CAT[/api/categorize]
    end
    
    subgraph Tasks ["Trigger.dev Tasks"]
        IST[initialSyncTask]
        INCT[incrementalSyncTask]
        HSS[hourlySyncSchedule]
    end
    
    subgraph Core ["Core Libraries"]
        PS[progressiveSync]
        QS[quickSync]
        FS[fullSync]
        YT[YouTube API]
        AI[AI Categorize]
    end
    
    subgraph DB ["Database"]
        VIDEOS[(videos)]
        CATS[(categories)]
        USERS[(users)]
    end
    
    OB -->|POST| OBC
    OBC -->|trigger| IST
    
    SB -->|POST| SYNC
    SYNC --> QS
    SYNC --> PS
    
    SB -->|POST| FSYNC
    FSYNC -->|trigger| IST
    
    SB -->|POST| CAT
    CAT --> AI
    
    HSS -->|cron| INCT
    INCT --> QS
    
    IST --> FS
    FS --> PS
    QS --> PS
    
    PS --> YT
    PS --> VIDEOS
    AI --> VIDEOS
    AI --> CATS
    
    DB --> USERS
```
