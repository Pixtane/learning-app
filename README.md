# Learning App

Ukrainian learning app built with Next.js and Neon Postgres.

## Implemented mode

- `Наголоси`
- Simple login by manual user ID stored in `localStorage`
- Add, edit, delete, and bulk import words
- Support for one or two stressed vowels using uppercase vowel letters
- Two training modes: random and learning
- Every answer is stored in Postgres and updates per-word progress

## Setup

1. Copy `.env.example` to `.env.local`
2. Put your Neon connection string into `DATABASE_URL`
3. Install dependencies:

```powershell
npm install
```

4. Start the app:

```powershell
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Notes

- Database tables are created automatically on first API use.
- Bulk import accepts newline-, comma-, or semicolon-separated words.
- Example words:

```text
вИпадок
зАвжди
перепИс
```
