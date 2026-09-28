# firebase/ (DRAFT, not deployed)

Everything in this folder is a **draft for the planned Firebase backend**. None of it has been deployed, there is no Firebase project connected, and the app does not use any of it. The app still runs entirely in the browser (`src/data/backend.ts`).

The full design, the reasons behind it, and the checklist of what John needs to set up in the Firebase console are in **[docs/data-storage.md](../docs/data-storage.md)**.

| File | What it is |
| --- | --- |
| `firestore.rules` | Cloud Firestore security rules. Clients can only read workspaces they are an active member of; clients never write; everything else is denied. |
| `storage.rules` | Cloud Storage rules for pallet photos. Members can view; Operators and above can upload images up to 5 MB; nobody can overwrite, delete or list. |
| `firestore.indexes.json` | Composite indexes the screens need (pallet history, reconcile lists, job and rack lists) and fields excluded from indexing to save cost. JSON has no comments, so the notes are here: every index maps to a query named in docs/data-storage.md, section 3. |
| `functions-draft/command.ts` | A commented TypeScript sketch of the `command` callable function: the local engine's five steps inside one Firestore transaction. Not compiled (outside `tsconfig.json`) and its packages are not installed. |

## Before anything here is deployed

1. John creates the project and sends back the values listed in docs/data-storage.md ("What John needs to do").
2. Add a `firebase.json` that points at these files, roughly:

   ```json
   {
     "firestore": { "rules": "firebase/firestore.rules", "indexes": "firebase/firestore.indexes.json" },
     "storage": { "rules": "firebase/storage.rules" },
     "functions": [{ "source": "functions", "codebase": "default" }],
     "emulators": { "auth": {}, "firestore": {}, "functions": {}, "storage": {}, "ui": {} }
   }
   ```

3. Move `src/domain` into a package the app and `functions/` both import, and build the real function from the sketch.
4. Run everything against the **Firebase Emulator Suite** first: the 38 blueprint scenarios against the function, and rules unit tests with two companies that reuse the same codes, every role, and a removed member.
5. Only then deploy, starting with the rules (`firebase deploy --only firestore:rules,storage`), then indexes, then functions.

Deploys are done by a person signed in to the Firebase CLI with access to the project. Never commit or share a service account key file.
