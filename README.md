# AI Exam Companion 🎓

AI Exam Companion is a premium, AI-powered test preparation assistant that helps students practice for competitive entrance exams (like **JEE**, **NEET**, **CAT**, **SAT**, **GMAT**, or **GRE**) and custom PDF uploads. 

The application uses **Google Gemini** to instantly generate high-fidelity practice questions with detailed solutions, dynamically targets your weak study areas, and provides an **AI Tutor Chatbot** for every question to guide you step-by-step.

---

## ✨ Core Features

1. **Standard Exam Presets (JEE, NEET, CAT, SAT, GMAT, GRE)**: Practice questions dynamically modeled after the structure, topics, and difficulties of actual entrance exams.
2. **Custom PDF Paper Analyzer**: Upload past question papers or notes in PDF format. The system analyzes the document's structure to extract a customized study blueprint.
3. **Adaptive Study Focus (40% Weak-Topic Bias)**: The app tracks your answers across attempts, highlights your weakest areas, and tilts new quizzes to contain ~40% questions from those topics.
4. **Interactive Exam Interface**: A realistic test-taking workspace with built-in LaTeX/math formatting, a navigation side-bar, question bookmarks, and an auto-submit countdown timer.
5. **Vertical Timeline Explanations**: Graded scorecards that display step-by-step solution explanations in a clean, visual timeline stepper layout.
6. **Per-Question AI Tutoring**: A sliding sidebar chat drawer powered by Gemini. You can ask for hints, formula breakdowns, or conceptual explanations scoped specifically to that question.
7. **Developer Sandbox Mode**: Run the app immediately without any cloud database setup. All authentication and quiz history fallback to browser `localStorage` while retaining Gemini features.

---

## 📖 End-User Guide: How to Access Features

### 📊 The Dashboard
When you open the app, you will see your **Dashboard**. 
- **Stats Panel**: Displays your overall question accuracy, total exams attempted, and a list of your current **Weak Topics**.
- **Action Panel**: The starting point for launching preset quizzes or custom paper analyses.
- **Horizontal Study Sources Grid**: Displays your active study sources (presets or custom PDFs) in visual, horizontal cards.
- **Recent Quiz Attempts List (Filterable)**: Displays your past attempt scores and dates with quick filters by exam source, duration, and performance tier.

### 📝 Taking a Preset Quiz
1. Click **Generate Preset Quiz** on the dashboard.
2. Select an exam source (e.g. `JEE`, `NEET`, `CAT`, `SAT`, `GMAT`, or `GRE`).
3. Choose a length:
   - **Short Quiz**: 5 Questions (approx. 5 minutes)
   - **Medium Quiz**: 10 Questions (approx. 10 minutes)
   - **Hour Exam**: 30 Questions (approx. 60 minutes)
4. Click **Start Exam Generation**. A holding progress bar will show the compilation state, and redirect you to the exam workspace.
5. In the quiz window, click options to select answers. Use the sidebar to jump between questions or bookmark them for review. Click **Submit Quiz** when finished (or let the timer run down to auto-submit).

### 📁 Uploading Custom Papers
1. Click **Analyze Custom Papers** on the dashboard.
2. Enter an **Exam Set Name** (e.g., "NEET Physics 2025").
3. Drag and drop your target PDF files (max 10MB per file) into the upload area.
4. Click **Start Paper Analysis**. The system will upload files and poll Gemini to extract topics and format a study blueprint. Once complete, you will be redirected to the dashboard, and your new custom source will appear in the **My Study Sources** list.

### 🔍 Reviewing Results & AI Tutoring
1. After submitting a quiz, you will see your graded scorecard showing correct vs. incorrect answers.
2. Click any question card to expand the **Solution Explanation**, rendered as a step-by-step timeline.
3. If you still don't understand the solution, click **Ask AI Tutor**. A side-drawer will open. You can type questions like:
   - *"Give me a hint for Step 2"*
   - *"What formula was used to solve this?"*
   - *"Explain this chemistry concept in simple terms"*

---

## 🚀 Step-by-Step Deployment Guide

Follow this simple, step-by-step procedure to clone, configure, and run the project on your local machine.

### 📋 Prerequisites
Ensure you have the following installed on your computer:
- [Node.js](https://nodejs.org/) (Version 18 or higher)
- [Git](https://git-scm.com/)

---

### Step 1: Clone the Repository
Open your terminal (macOS/Linux) or Command Prompt (Windows) and run:
```bash
git clone https://github.com/thesamotar/AI-Exam-Companion.git
cd AI-Exam-Companion
```

---

### Step 2: Install Dependencies
Install the required packages by running:
```bash
npm install
```

---

### Step 3: Setup the Database (Supabase)
This project uses **Supabase** to manage authentication, scorecards, and custom PDF storage.

1. Go to [Supabase](https://supabase.com) and sign up for a free account.
2. Click **New Project** and name it (e.g., `AI Exam Companion`). Set a database password.
3. Once the project is provisioned, go to the **SQL Editor** in the left sidebar.
4. Click **New Query**, paste the entire contents of [supabase_schema.sql](file:///Users/abhishek/Desktop/Projects/AI%20Exam%20Companion/AI-Exam-Companion/supabase_schema.sql), and click **Run**. This creates all database tables, optimization indices, and row-level security (RLS) rules.
5. Create a storage container and set up folder security:
   - Click **Storage** in the left sidebar.
   - Click **New Bucket**, name it exactly **`papers`**, set it to **Private**, and click **Create**.
   - Go back to the **SQL Editor** in the left sidebar, click **New Query**, paste the following queries, and click **Run** to instantly provision folder security:
     ```sql
     -- 1. Allow authenticated users to view their own uploaded files
     CREATE POLICY "Allow authenticated read on own folder" ON storage.objects
       FOR SELECT TO authenticated
       USING (bucket_id = 'papers' AND (storage.foldername(name))[1] = auth.uid()::text);

     -- 2. Allow authenticated users to upload files to their own folder
     CREATE POLICY "Allow authenticated insert on own folder" ON storage.objects
       FOR INSERT TO authenticated
       WITH CHECK (bucket_id = 'papers' AND (storage.foldername(name))[1] = auth.uid()::text);

     -- 3. Allow authenticated users to delete files from their own folder
     CREATE POLICY "Allow authenticated delete on own folder" ON storage.objects
       FOR DELETE TO authenticated
       USING (bucket_id = 'papers' AND (storage.foldername(name))[1] = auth.uid()::text);
     ```

---

### Step 4: Get a Gemini API Key
This project requires a **Google Gemini API Key** to generate quizzes and run the tutor chat.

1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google (Gmail) account.
3. Click the **Get API key** button in the top-left menu.
4. Click **Create API key** (and select *Create API key in new project*).
5. Copy the generated key (which looks like `AIzaSy...`).

---

### Step 5: Configure Local Variables
1. Duplicate the `.env.example` file in the root directory to create `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Open `.env.local` in your text editor and fill in the values:
   ```env
   # Your Supabase Project Settings -> API URL
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   
   # Your Supabase Project Settings -> API anon public key
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   
   # Your Google Gemini API Key from Step 4
   GEMINI_API_KEY=AIzaSyYourCopiedAPIKeyHere
   
   # Optional model defaults
   GEMINI_GENERATION_MODEL=gemini-3.5-flash
   GEMINI_CHAT_MODEL=gemini-3.1-flash-lite
   ```
   *(Replace placeholders like `https://your-project-id.supabase.co` with your actual project credentials from your Supabase Dashboard under Settings -> API).*

---

### Step 6: Start the Application
Run the following command to boot up the local server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser. The app is now fully functional and running locally!
