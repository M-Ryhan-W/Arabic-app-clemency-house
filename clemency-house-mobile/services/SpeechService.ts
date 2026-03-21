import { SpeechRecognition } from '@capacitor-community/speech-recognition';

/**
 * Normalizes Arabic text by removing diacritics (harakat) and standardizing letters.
 * This allows comparison of spoken text against target text regardless of vowel marks.
 */
export const normalizeArabic = (text: string): string => {
    return text
        // Remove Harakat (Fatha, Damma, Kasra, Sukun, Shadda, Tanween)
        .replace(/[\u064B-\u0652]/g, "")
        // Standardize Alif (Convert أ, إ, آ to plain ا)
        .replace(/[أإآ]/g, "ا")
        // Standardize Taa Marbuta (Convert ة to ه) - Optional, depends on your preference
        .replace(/ة/g, "ه")
        // Remove punctuation and extra spaces
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
};

/**
 * SpeechService handles speech-to-text functionality using the Capacitor Speech Recognition plugin.
 * It provides methods to check availability, request permissions, start/stop listening.
 */
export class SpeechService {

    /**
     * Check if speech recognition is available on the device
     */
    async checkAvailability(): Promise<boolean> {
        const available = await SpeechRecognition.available();
        return available.available;
    }

    /**
     * Request Microphone Permissions
     */
    async requestPermissions(): Promise<void> {
        await SpeechRecognition.requestPermissions();
    }

    /**
     * Start Listening for speech input
     * @param language - The language code for recognition (default: 'ar-SA' for Arabic - Saudi Arabia)
     * @returns Promise that resolves with the transcribed text
     */
    async startListening(language: string = 'ar-SA'): Promise<string> {
        return new Promise(async (resolve, reject) => {

            const isAvailable = await this.checkAvailability();
            if (!isAvailable) {
                reject("Speech recognition not available");
                return;
            }

            SpeechRecognition.start({
                language: language,
                partialResults: false, // Set to true if you want to see text as they speak
                popup: false,          // Set to true for a default system popup UI
            });

            // Listen for the final result
            SpeechRecognition.addListener('partialResults', (data: any) => {
                if (data.matches && data.matches.length > 0) {
                    resolve(data.matches[0]); // Returns the most likely transcription
                }
            });
        });
    }

    /**
     * Stop Listening manually
     */
    async stopListening(): Promise<void> {
        await SpeechRecognition.stop();
    }
}

// Create a singleton instance for easy import
export const speechService = new SpeechService();
