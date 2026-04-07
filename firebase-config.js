/**
 * Firebase Console: Project settings → Your apps → Web app → copy config.
 * Authentication: enable Google sign-in; add your GitHub Pages domain under Authorized domains.
 * Firestore: create database; use rules that restrict reads/writes to the signed-in user (see cloud.js header).
 *
 * Leave as null for local-only storage (IndexedDB). Example:
 *
 * window.HYROX_FIREBASE_CONFIG = {
 *   apiKey: "...",
 *   authDomain: "your-project.firebaseapp.com",
 *   projectId: "your-project-id",
 *   storageBucket: "your-project.appspot.com",
 *   messagingSenderId: "...",
 *   appId: "1:...:web:...",
 * };
 */
window.HYROX_FIREBASE_CONFIG = null;
