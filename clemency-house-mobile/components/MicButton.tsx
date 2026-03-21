import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { speechService, normalizeArabic } from '@/services/SpeechService';

interface MicButtonProps {
    targetText: string;
    onSuccess: () => void;
    onRetry: () => void;
    onError?: (error: string) => void;
    size?: number;
    primaryColor?: string;
    listeningColor?: string;
}

export const MicButton: React.FC<MicButtonProps> = ({
    targetText,
    onSuccess,
    onRetry,
    onError,
    size = 70,
    primaryColor = '#3880ff',
    listeningColor = '#eb445a',
}) => {
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Animated value for pulse ring
    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(0.5);

    const pulseRingStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
        opacity: pulseOpacity.value,
    }));

    const startPulseAnimation = () => {
        pulseScale.value = 1;
        pulseOpacity.value = 0.5;
        pulseScale.value = withRepeat(
            withTiming(1.8, { duration: 1500, easing: Easing.out(Easing.ease) }),
            -1,
            false
        );
        pulseOpacity.value = withRepeat(
            withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) }),
            -1,
            false
        );
    };

    const stopPulseAnimation = () => {
        pulseScale.value = 1;
        pulseOpacity.value = 0;
    };

    const toggleListening = async () => {
        if (isListening) {
            await speechService.stopListening();
            setIsListening(false);
            stopPulseAnimation();
            return;
        }

        try {
            // Request permissions first
            await speechService.requestPermissions();

            setIsListening(true);
            startPulseAnimation();

            // 1. Get the transcription from the service
            const result = await speechService.startListening('ar-SA');

            setIsListening(false);
            stopPulseAnimation();
            setIsProcessing(true);

            // 2. Normalize and Compare
            const normalizedUserSpeech = normalizeArabic(result);
            const normalizedTarget = normalizeArabic(targetText);

            // Use includes() for partial matching (handles extra words from speech engine)
            if (normalizedUserSpeech.includes(normalizedTarget)) {
                onSuccess();
            } else {
                onRetry();
            }
        } catch (error) {
            console.error('Speech recognition error:', error);
            setIsListening(false);
            stopPulseAnimation();
            if (onError) {
                onError(error as string);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <View style={[styles.container, { width: size + 30, height: size + 30 }]}>
            {/* Pulse Ring (only visible when listening) */}
            {isListening && (
                <Animated.View
                    style={[
                        styles.pulseRing,
                        pulseRingStyle,
                        {
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            backgroundColor: listeningColor,
                        },
                    ]}
                />
            )}

            {/* Mic Button */}
            <TouchableOpacity
                onPress={toggleListening}
                disabled={isProcessing}
                activeOpacity={0.8}
                style={[
                    styles.micButton,
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        backgroundColor: isListening ? listeningColor : primaryColor,
                        transform: [{ scale: isListening ? 1.1 : 1 }],
                    },
                ]}
            >
                {isProcessing ? (
                    <ActivityIndicator size="large" color="#ffffff" />
                ) : (
                    <Ionicons
                        name={isListening ? 'mic' : 'mic-outline'}
                        size={size * 0.45}
                        color="#ffffff"
                    />
                )}
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pulseRing: {
        position: 'absolute',
        zIndex: 1,
    },
    micButton: {
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
});

export default MicButton;
