# Ballroom

> AI-powered organization for your YouTube liked videos

Ballroom helps you automatically organize your YouTube liked videos into categories using AI. Sync your liked videos, let AI categorize them, and keep everything organized in one place.

## ✨ Features

- **🔐 Secure Authentication** - Sign in with Google OAuth (Better Auth)
- **📺 YouTube Sync** - Automatically sync your liked videos from YouTube
- **🤖 AI Categorization** - Intelligent video categorization using Google Generative AI
- **📁 Category Management** - Create, edit, and organize custom categories
- **🎯 Smart Filtering** - Filter videos by category with real-time counts
- **📄 Pagination** - Efficient browsing of large video collections
- **🔄 Background Jobs** - Automated syncing and categorization via Trigger.dev
- **📱 Responsive Design** - Beautiful, modern UI built with Radix UI and Tailwind CSS

## 🛠️ Tech Stack

| Layer           | Technology            | Version   |
| --------------- | --------------------- | --------- |
| Framework       | Next.js (App Router)  | 16.1.0    |
| Language        | TypeScript            | 5.x       |
| React           | React                 | 19.2.0    |
| Styling         | Tailwind CSS          | 4.x       |
| UI Components   | Radix UI + shadcn/ui  | Latest    |
| Database        | PostgreSQL            | -         |
| ORM             | Drizzle ORM           | 0.44.7    |
| Auth            | Better Auth           | 1.3.27    |
| AI              | Google Generative AI  | -         |
| Background Jobs | Trigger.dev           | 4.3.0     |
| Forms           | React Hook Form + Zod | 7.x / 4.x |
| Package Manager | pnpm                  | -         |

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** 20.x or later
- **pnpm** installed (`npm install -g pnpm`)
- **PostgreSQL** database (local or hosted)
- **Google Cloud Project** with:
  - OAuth 2.0 credentials (Client ID & Secret)
  - YouTube Data API v3 enabled
  - Google Generative AI API enabled
- **Trigger.dev** account and project

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ballroom
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ballroom"

# Google OAuth & YouTube API
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Google Generative AI API
GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-api-key"

# Better Auth
BETTER_AUTH_SECRET="generate-a-random-secret-here"
BETTER_AUTH_URL="http://localhost:3000"  # Optional, defaults to current URL

# Trigger.dev
TRIGGER_SECRET_KEY="your-trigger-dev-secret-key"

# Node Environment
NODE_ENV="development"
```

**Generate a secure secret for Better Auth:**

```bash
openssl rand -base64 32
```

**Validate environment variables:**

```bash
pnpm check-env
```

### 4. Set Up Database

**Generate migrations:**

```bash
pnpm db:generate
```

**Run migrations:**

```bash
pnpm db:migrate
```

**Or push schema directly (development only):**

```bash
pnpm db:push
```

**Open Drizzle Studio (database GUI):**

```bash
pnpm db:studio
```

### 5. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable **YouTube Data API v3** and **Google Generative AI API**
4. Go to **APIs & Services > Credentials**
5. Create **OAuth 2.0 Client ID** (Web application)
6. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
7. Copy Client ID and Secret to `.env.local`

### 6. Set Up Trigger.dev

1. Sign up at [Trigger.dev](https://trigger.dev)
2. Create a new project
3. Copy your project reference to `trigger.config.ts`
4. Copy your secret key to `.env.local`
5. Deploy your workflows: `npx trigger.dev@latest deploy`

### 7. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── (auth)/             # Auth route group (signin page)
│   ├── api/                # API routes (REST endpoints)
│   │   ├── auth/           # Better Auth catch-all route
│   │   ├── categories/     # Category CRUD endpoints
│   │   ├── categorize/    # AI categorization endpoint
│   │   ├── onboarding/    # Onboarding flow
│   │   ├── sync-status/   # Sync status endpoint
│   │   └── youtube/        # YouTube sync & video endpoints
│   ├── dashboard/          # Main dashboard (client component)
│   ├── onboarding/         # Onboarding flow
│   ├── layout.tsx          # Root layout with providers
│   └── page.tsx             # Landing page
├── components/
│   ├── layouts/            # Layout components (MainLayout, Providers)
│   ├── ui/                 # shadcn/ui components
│   ├── category-manager.tsx
│   ├── sync-button.tsx
│   └── video-card.tsx
├── db/
│   ├── index.ts            # Database connection
│   └── schemas/            # Drizzle schema definitions
│       ├── auth.ts         # User, session, account tables
│       ├── helpers.ts      # Shared helpers (lifecycle_dates, createId)
│       ├── videos.ts       # Videos, categories tables
│       └── index.ts        # Schema exports
├── hooks/                  # Custom React hooks
├── lib/
│   ├── ai/                 # AI utilities
│   │   └── categorize.ts  # Video categorization with Google AI
│   ├── auth/               # Auth utilities
│   │   ├── client.ts      # Client-side auth hooks
│   │   ├── server.ts      # Better Auth config
│   │   └── session.ts     # Session helpers (requireSession)
│   ├── validations/        # Zod schemas for API validation
│   ├── constants.tsx       # App constants & localStorage schemas
│   ├── env.ts              # Environment variable validation
│   ├── errors.ts           # AppError class & error utilities
│   ├── logger.ts           # Structured logging utility
│   ├── site.ts             # Site metadata config
│   ├── utils.ts            # Utility functions (cn, error helpers)
│   └── youtube.ts          # YouTube API client
├── types/
│   └── video.ts            # Video type definitions (Database/Server/Client)
└── workflows/              # Trigger.dev background jobs
    ├── scheduled-sync.ts   # Scheduled video sync
    └── sync-videos.ts      # Video sync workflow
```

## 🔌 API Endpoints

### Authentication

- `GET/POST /api/auth/[...all]` - Better Auth catch-all route

### Categories

- `GET /api/categories` - Get all user categories
- `POST /api/categories` - Create a new category
- `GET /api/categories/[id]` - Get category by ID
- `DELETE /api/categories/[id]` - Delete a category

### YouTube

- `GET /api/youtube/videos` - Get paginated videos (with filters)
- `GET /api/youtube/videos/counts` - Get video counts by category
- `POST /api/youtube/sync` - Trigger video sync
- `POST /api/youtube/full-sync` - Full sync with categorization

### Categorization

- `POST /api/categorize` - Categorize videos using AI

### Onboarding

- `POST /api/onboarding/complete` - Mark onboarding as complete

### Sync Status

- `GET /api/sync-status` - Get current sync status

## 🗄️ Database Schema

### Core Tables

- **user** - User accounts (managed by Better Auth)
- **session** - User sessions
- **account** - OAuth accounts (Google with YouTube scope)
- **categories** - User-defined video categories
- **videos** - Synced YouTube videos with category assignments

### Key Relationships

- Users have many categories (with default seeds on signup)
- Users have many videos (unique constraint on userId + youtubeId)
- Videos optionally belong to a category (nullable foreign key)

## 🧪 Development

### Available Scripts

| Command            | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `pnpm dev`         | Start development server                        |
| `pnpm build`       | Build for production                            |
| `pnpm start`       | Start production server                         |
| `pnpm lint`        | Run ESLint                                      |
| `pnpm db:generate` | Generate Drizzle migrations from schema changes |
| `pnpm db:migrate`  | Run pending migrations                          |
| `pnpm db:push`     | Push schema directly (dev only)                 |
| `pnpm db:studio`   | Open Drizzle Studio (database GUI)              |
| `pnpm check-env`   | Validate environment variables                  |

### Code Patterns

**Path Aliases:**

- Use `~/` for imports from `src/`

**Error Handling:**

- Use `AppError` class for consistent error responses
- All API routes follow standard error handling pattern

**Type Safety:**

- Videos have three type layers: `DatabaseVideo`, `Video`, `SerializedVideo`
- Always serialize before sending to client

**Logging:**

- Use structured logger (`~/lib/logger`) instead of `console.log`

## 🚢 Deployment

### Environment Variables

Ensure all required environment variables are set in your production environment:

```bash
DATABASE_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_GENERATIVE_AI_API_KEY
BETTER_AUTH_SECRET
BETTER_AUTH_URL  # Your production URL
TRIGGER_SECRET_KEY
NODE_ENV=production
```

### Build & Deploy

```bash
# Build the application
pnpm build

# Run migrations
pnpm db:migrate

# Start production server
pnpm start
```

### Vercel Deployment

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

The app will automatically build and deploy on every push to main.

### Trigger.dev Deployment

Deploy your background workflows:

```bash
npx trigger.dev@latest deploy
```

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linting (`pnpm lint`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📝 License

This project is private and proprietary.

## 🔗 Links

- **Website**: [ballroom.ygkr.live](https://ballroom.ygkr.live)
- **Author**: [Yash Gourav Kar](https://ygkr.live)
- **Twitter**: [@YashGouravKar1](https://x.com/YashGouravKar1/)

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org)
- UI components from [shadcn/ui](https://ui.shadcn.com)
- Authentication by [Better Auth](https://www.better-auth.com)
- Background jobs powered by [Trigger.dev](https://trigger.dev)

---

Made with ❤️ for organizing YouTube videos
