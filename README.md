# Tender Agent

> **AI-Powered Public Tender Search & Analysis Platform**

Tender Agent is a sophisticated web application that leverages artificial intelligence to help users discover, analyze, and understand public tenders across Italy and the European Union. Built with modern web technologies and AI capabilities, it transforms complex tender documents into accessible, actionable insights.

## 🎯 Overview

Tender Agent combines natural language processing with real-time data from the TED (Tenders Electronic Daily) API to provide an intuitive chat-based interface for tender discovery. Users can search for tenders using conversational queries and receive AI-generated summaries, eligibility analysis, and personalized recommendations.

## ✨ Key Features

### 🔍 **Intelligent Search**

- Natural language queries (e.g., "trova bandi software pubblicati oggi in Lombardia")
- Real-time TED API integration
- Advanced filtering by location, sector, value, and deadline
- Framework agreement and dynamic purchasing system support

### 🤖 **AI-Powered Analysis**

- LangGraph-based conversational AI agent
- Automatic tender summarization in Italian
- Eligibility analysis based on company profiles
- Smart suggestion generation
- Personalized recommendations

### 📊 **Comprehensive Dashboard**

- Personalized tender feed
- Company profile management
- Eligibility scoring and analysis
- Favorite tender management
- Advanced search capabilities

### 💬 **Interactive Chat Interface**

- Apple-inspired minimal design
- Real-time tender search and analysis
- Contextual suggestions
- PDF and TED page integration

## 🏗️ Architecture

### Frontend

- **Framework**: Next.js 15 with App Router
- **UI Library**: React 19, Tailwind CSS, Radix UI, Shadcn UI
- **State Management**: React hooks and context
- **Authentication**: Firebase Auth with persistence

### Backend

- **Runtime**: Firebase Cloud Functions (Node.js 22)
- **AI Framework**: LangGraph with LangChain
- **Database**: Firestore for user data and caching
- **External APIs**: TED API v3, OpenRouter LLM providers

### AI & ML Stack

- **Agent Framework**: LangGraph for conversation orchestration
- **LLM Providers**: OpenRouter (GPT-4o, Claude 3.5 Sonnet, DeepSeek)
- **Tools**: Custom tools for TED API integration, eligibility analysis
- **Memory**: Conversation persistence and user behavior tracking

## 🚀 Getting Started

### Prerequisites

- Node.js 22+
- npm or yarn
- Firebase CLI
- OpenRouter API key

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd tender
   ```

2. **Install dependencies**

   ```bash
   # Frontend dependencies
   npm install

   # Functions dependencies
   cd functions
   npm install
   cd ..
   ```

3. **Configure Firebase**

   ```bash
   firebase login
   firebase use tender-fc022
   ```

4. **Set up environment variables**

   Create `functions/.env.local`:

   ```env
   OPENROUTER_API_KEY=your-openrouter-api-key-here
   ```

5. **Start development servers**

   ```bash
   # Terminal 1: Start Firebase emulators
   firebase emulators:start --only functions,firestore --project tender-fc022

   # Terminal 2: Start Next.js development server
   npm run dev
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - Firebase Emulator UI: http://127.0.0.1:4000

## 📁 Project Structure

```
tender/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                 # Main chat interface
│   ├── dashboard/               # Personalized dashboard
│   ├── profilo-aziendale/      # Company profile management
│   ├── ricerca-avanzata/       # Advanced search
│   └── accordi-quadro/         # Framework agreements
├── components/                  # React components
│   ├── ui/                     # Shadcn UI components
│   ├── Header.tsx             # Navigation header
│   ├── AuthProvider.tsx       # Authentication context
│   └── AnalysisDialog.tsx     # Analysis results modal
├── functions/                  # Firebase Cloud Functions
│   ├── src/
│   │   ├── index.ts           # Main function exports
│   │   ├── graph/             # LangGraph agent and tools
│   │   ├── lib/               # Utilities and configurations
│   │   └── jobs/              # Background job processors
│   └── package.json           # Functions dependencies
├── lib/                        # Shared utilities
│   ├── firebaseClient.ts      # Firebase client configuration
│   ├── authedFetch.ts         # Authenticated API calls
│   └── types.ts               # TypeScript type definitions
└── public/                     # Static assets
```

## 🔧 Development

### Available Scripts

```bash
# Frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Functions
cd functions
npm run build        # Compile TypeScript
npm run serve        # Serve functions locally
```

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured with Next.js rules
- **Prettier**: Code formatting
- **Conventional Commits**: Git commit message format

### Key Development Concepts

#### AI Agent Architecture

The LangGraph agent orchestrates conversations using specialized tools:

- `searchTendersTool`: TED API integration
- `analyzeEligibilityTool`: Company-tender matching
- `generateSmartSuggestionsTool`: AI-powered recommendations

#### Data Flow

1. User input → Frontend validation
2. Firebase Functions → LangGraph agent
3. Agent tools → TED API / Firestore
4. AI processing → Structured response
5. Frontend rendering → User interface

## 🚀 Deployment

### Firebase Functions Deployment

```bash
# Build and deploy functions
cd functions
npm run build
cd ..
firebase deploy --only functions --project tender-fc022
```

### Frontend Deployment

The frontend can be deployed to:

- **Vercel** (recommended for Next.js)
- **Firebase Hosting**
- **Netlify**

### Environment Configuration

For production deployment, ensure:

- OpenRouter API key is configured
- Firebase project is properly set up
- CORS policies are configured
- Authentication is enabled

## 📊 API Reference

### Core Endpoints

- `POST /agentChat` - Main chat interface
- `POST /suggestions` - AI-powered suggestions
- `GET /getBestTenders` - Personalized recommendations
- `POST /analyzeEligibility` - Tender eligibility analysis
- `POST /upsertCompanyProfile` - Company profile management

### TED API Integration

The application integrates with TED API v3 for real-time tender data:

- Search by keywords, location, sector
- Filter by publication date, deadline, value
- Retrieve official documents and metadata

## 🤝 Contributing

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Test thoroughly**
5. **Submit a pull request**

### Code Review Process

- All changes require review
- Tests must pass
- TypeScript compilation must succeed
- ESLint warnings should be addressed

### Reporting Issues

When reporting issues, please include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Screenshots if applicable

## 📈 Performance

### Optimization Strategies

- **Frontend**: React 19 concurrent features, optimized re-renders
- **Backend**: Firebase Functions with appropriate memory allocation
- **Caching**: Firestore for user data, TED API response caching
- **AI**: Efficient prompt engineering, tool call optimization

### Monitoring

- Firebase Functions logs
- Real-time performance metrics
- Error tracking and alerting
- User analytics

## 🔒 Security

### Authentication

- Firebase Authentication with email/password
- Session persistence across browser refreshes
- Secure token management

### Data Protection

- User data encrypted in Firestore
- API keys secured in environment variables
- CORS policies configured
- Input validation and sanitization

## 📚 Documentation

### Additional Resources

- [TED API Documentation](https://ted.europa.eu/api/v3/docs)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Firebase Functions Guide](https://firebase.google.com/docs/functions)
- [Next.js Documentation](https://nextjs.org/docs)

### Troubleshooting

Common issues and solutions:

- **Emulator connection issues**: Check port availability
- **API key errors**: Verify environment variable configuration
- **Build failures**: Ensure Node.js version compatibility
- **Authentication issues**: Check Firebase project configuration

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- TED (Tenders Electronic Daily) for providing the public tender API
- LangChain team for the AI framework
- Firebase team for the backend infrastructure
- OpenRouter for LLM access

---

**Built with ❤️ for the Italian and EU public procurement community**
