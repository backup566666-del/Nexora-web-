import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const firebaseProjectId = firebaseConfig.projectId;

let connectionTested = false;

export async function testConnection(): Promise<boolean> {
  if (connectionTested) return true;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: Firestore client is offline.');
      return false;
    }
    return true;
  }
}

void testConnection();
