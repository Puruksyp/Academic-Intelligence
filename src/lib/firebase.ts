import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import fbConfig from '../../firebase-applet-config.json' assert { type: 'json' };

const app = initializeApp(fbConfig);
export const auth = getAuth(app);
export const db = fbConfig.firestoreDatabaseId && fbConfig.firestoreDatabaseId !== "(default)" 
  ? getFirestore(app, fbConfig.firestoreDatabaseId) 
  : getFirestore(app);

const provider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google Popup", error);
    throw error;
  }
};

export const signInWithGoogleRedirect = async () => {
  try {
    await signInWithRedirect(auth, provider);
  } catch (error) {
    console.error("Error signing in with Google Redirect", error);
    throw error;
  }
};
