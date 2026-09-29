# Wherehouse backend

This directory now contains working Firebase functions, database rules, photo rules, CORS settings and indexes. See [the setup walkthrough](../docs/firebase-setup.md) for deployment and activation.

`functions/src/index.ts` runs the same validated domain engine as the sample app, inside Firestore transactions. The server derives the actor from Firebase Authentication, checks verified email and current membership, then saves state, history and request receipts atomically. Clients cannot write warehouse documents directly.

The old `functions-draft` directory is historical reference only and is not deployed. Use `functions/`.
