# Video Script: Bandifinder.it Project Walkthrough

**Duration: ~15 minutes | Tone: Conversational, like showing to friends**

---

## [0:00-2:00] Background

### 1. What the project does (3 sentences)

"Hey! So I want to show you Bandifinder.it - it's basically an AI-powered platform that helps Italian companies find and analyze public tenders from the European TED database. Think of it like a smart search engine that not only finds relevant tenders but also uses AI to analyze whether your company is eligible for each one, gives you personalized recommendations, and even helps you understand complex contract documents. It's built specifically for the Italian market, so everything is in Italian and it understands the local procurement landscape."

### 2. Why it was built / Value proposition

"You know, finding public tenders in Italy is actually really hard - the TED database is massive, the queries are complex, and most companies just don't have the time or expertise to search effectively. So I built this to solve that problem. The value is pretty clear: companies can find opportunities they would have missed, get instant eligibility analysis instead of spending hours reading contracts, and the AI chat interface makes it feel like you're talking to an expert procurement consultant. It's basically democratizing access to public contracts for smaller companies."

### 3. Show the platform frontend

**[SCREEN SHARE: Open the live site or local dev]**

"Alright, so here's the actual platform. [Navigate to homepage] This is the main chat interface - it's super clean and simple. Users just type in natural language like 'trova bandi informatica in Lombardia' and the AI handles everything. [Show a search]

Over here you can see the tender cards that pop up - each one shows all the key info, and you can expand for more details. [Click to expand] There's also this eligibility analysis feature where it scores each tender for your company profile. [Show analysis]

The whole UI is built with Next.js and React, so it's fast and responsive. Everything streams in real-time, which makes it feel really smooth."

---

## [2:00-7:00] Technical Questions

### 1. Tech stack

"So the tech stack: Next.js 15 with React 19 for the frontend - needed SSR for SEO. Backend is Firebase Cloud Functions with Node.js 22. For AI, I'm using LangGraph for multi-agent orchestration - different agents handle search, analysis, personalization. LLM access through OpenRouter, Pinecone for vector search, OpenAI embeddings, and Firestore for the database."

### 2. Why this tech stack?

"Next.js for fast loads and great DX. Firebase Functions - wanted to focus on features, not infrastructure. Auto-scaling, easy deployment, it just works. LangGraph lets me build specialized agents that work together - the supervisor routes intelligently. OpenRouter gives flexibility to switch models. Pinecone for proper vector search - Firestore isn't built for that. The whole stack is serverless, scales from zero to thousands automatically."

### 3. Data architecture overview

**[SCREEN SHARE: Show Firestore console or code structure]**

"Main collections: `profiles` for user preferences, `companies` for eligibility analysis data, `tenders` cached from TED API with AI summaries, `matches` linking companies to tenders with scores, `applications` tracking submissions, and `favorites` for saved tenders.

Structure is flat - Firestore charges per document read, so simple is cheaper. Tender docs store raw TED data plus enriched fields like AI summaries. Company profiles match what we need for eligibility scoring - revenue, employee count, certifications, regions. Designed for fast, accurate AI analysis."

### 4. A bug you can't forget

"Oh man, this bug drove me crazy. AI chat worked in dev, but in production tenders weren't showing. The agent was generating markdown tables, but frontend wasn't parsing them. Spent two days debugging... turns out the agent used `advanced_search` instead of `search_tenders`, and my extraction only looked for `search_tenders` results. The tool WAS returning data, just in a different format - `{tenders: [...], query: "...", filters: {...}}` instead of an array. Classic case of data being there, just not where I was looking. Fixed by updating extraction to handle both formats."

### 5. Customer complaint investigation journey

"Customer says 'no results but I know tenders exist.' My process:

1. Check Firebase Functions logs - see the query generated, if TED API was called, what it returned
2. Check Firestore - if TED returned data but it's not stored, that's storage. If stored but not showing, that's frontend
3. Browser DevTools - Network tab for API responses, Console for errors, React DevTools for component state
4. LangGraph logs - track every agent decision and tool call, see the AI's reasoning
5. TED API response - check query syntax, rate limits, data format changes

Tools: Firebase Console, DevTools, code with breakpoints, telemetry tracking agent decisions. Follow the flow: user input → AI agent → tool call → API → database → frontend."

---

## [7:00-12:00] Code Overview

### 1. Codebase structure

**[SCREEN SHARE: Show project structure in VS Code]**

"Monorepo with frontend and backend together. [Open VS Code]

**Frontend (`app/`):** Next.js App Router - each route is a folder with `page.tsx`. Main chat is `app/page.tsx`. [Show structure] `app/hooks/` has `useAgentStream` for SSE streaming and `useAgentState` for chat state. `app/components/` has `ProgressiveTenderCard`, `ContractReviewCard`, `AgentStatus`. Root `components/` has shared UI (shadcn/ui).

**Backend (`functions/src/`):** Organized by feature. [Show structure]

- `graph/` - AI agent logic. `supervisor.ts` orchestrates, `agents/` has specialized agents (search, analysis, personalization, contractReview), `tools.ts` defines LangChain tools, `agentChatStream.ts` handles streaming, `responseFormatter.ts` extracts structured data
- `api/` - HTTP endpoints by feature (tenders, preferences, applications, suggestions)
- `lib/` - Core services: `ted.ts` (TED API), `rag.ts` (RAG system), `pinecone.ts`, `llm.ts` (LLM factory), `firestore.ts`, `brevo.ts`
- `jobs/` - Background jobs: `pull.ts` fetches tenders, `process.ts` enriches them
- `utils/` - Helpers (CORS, dates, formatting)

Dependencies: LangChain, LangGraph, Pinecone, Firebase SDKs, OpenRouter. Minimal and focused.

Why this structure? Scales well - new feature goes in the right place. API endpoints separate from business logic for easier testing. AI logic isolated in `graph/`. TypeScript throughout for type safety."

### 2. Build and deployment process

**[SCREEN SHARE: Show package.json scripts or Firebase config]**

"Build: Next.js handles frontend (`npm run build`), TypeScript compiles functions to JavaScript. [Show package.json]

Deployment via Firebase CLI: `firebase deploy --only functions` for backend, `--only hosting` for frontend. Frontend can auto-build on Vercel, functions deploy separately.

Firebase Secrets for API keys (OpenRouter, OpenAI, Brevo) - managed in Console, injected at runtime. Firestore rules and indexes deploy separately. Pretty automated - TypeScript catches errors before deployment."

### 3. What I built vs libraries

"**Built myself:** Multi-agent system (supervisor, agents, routing), RAG pipeline (chunking, embedding, vector search), TED API integration and query builder, eligibility scoring algorithm, streaming chat interface (SSE, parsing, state), tender card components, data model.

**Used libraries:** LangChain/LangGraph for agent framework, Pinecone for vectors, OpenAI embeddings, OpenRouter for LLM access, Firebase infrastructure, Next.js/React, Zod for validation.

Libraries are building blocks - the business logic (agent decisions, eligibility calculation, RAG) is all custom. Libraries handle infrastructure, I handle the intelligence."

---

## [12:00-15:00] Summary Questions

### 1. What you're most proud of

"The multi-agent system. Not just a chatbot - specialized agents work together intelligently. Search agent finds tenders, analysis agent scores them, personalization learns from behavior. Supervisor routes based on intent. Like a team of experts working together. Took a lot of thought and iteration, but makes the system way more capable than a single monolithic AI."

### 2. What you'd improve

"RAG system - add better chunking, hybrid semantic/keyword search, improve prompt engineering. Error handling - add retry logic, fallback data sources, better UX when TED API is down. Testing - more integration tests for APIs, better unit tests for business logic. Performance - optimize initial load, add caching for common searches, optimize Firestore queries."

### 3. Would you choose the same tech stack?

"Mostly yes, with tweaks. Next.js/React - perfect, no change. Firebase Functions - great for MVP, might consider traditional backend for more control later. LangGraph is powerful but complex - might consider simpler single-agent approach, but multi-agent makes this special, so probably keep it. Vector DB - Pinecone is expensive, might look at Qdrant or cheaper alternatives. Overall, stack let me build complex, scalable system quickly."

---

## [Closing - 15:00+]

"Alright, that's basically the project! It's been a really fun build - combining AI, real-time data, and a clean UX. The whole thing is live at bandifinder.it if you want to check it out. Thanks for watching, and feel free to ask any questions!"

---

## Screen Share Checklist

- [ ] Homepage/chat interface
- [ ] Tender search and results
- [ ] Tender card expansion
- [ ] Eligibility analysis
- [ ] VS Code project structure
- [ ] Key files (supervisor, tools, RAG)
- [ ] Firebase Console (optional)
- [ ] Package.json dependencies

---

## Tips for Recording

1. **Be natural** - Don't read word-for-word, use this as a guide
2. **Show enthusiasm** - You built something cool, be excited about it!
3. **Pause for screen shares** - Give time for viewers to see what you're showing
4. **It's okay to go over 15 minutes** - Better to be thorough than rushed
5. **Fix any obvious bugs first** - Make sure the demo works smoothly
6. **Practice the flow once** - Know what you're going to click/show
