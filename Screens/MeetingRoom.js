import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    Dimensions,
    Animated,
    Platform,
    Modal,
    TextInput,
    KeyboardAvoidingView,
    FlatList,
    PanResponder,
    Image,
    ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { WebView } from 'react-native-webview';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

const COLORS = ['#FFFFFF', '#EF4444', '#D71A21', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];
const STROKE_WIDTHS = [2, 4, 8, 12];

export default function MeetingRoom({ route, navigation }) {
    const { meeting, userEmail, userName } = route.params || {};
    const [participants, setParticipants] = useState(meeting?.participants || []);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [facing, setFacing] = useState('front');
    const [hasJoined, setHasJoined] = useState(false);
    const [meetingDuration, setMeetingDuration] = useState(0);
    const [permission, requestPermission] = useCameraPermissions();

    // View modes: 'camera', 'screenshare', 'whiteboard'
    const [viewMode, setViewMode] = useState('camera');

    // Chat State
    const [chatVisible, setChatVisible] = useState(false);
    const [messages, setMessages] = useState([
        { id: '1', sender: meeting?.host_name || 'Host', text: 'Welcome to the meeting! 👋', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isHost: true }
    ]);
    const [newMessage, setNewMessage] = useState('');

    // Whiteboard State
    const [paths, setPaths] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [strokeColor, setStrokeColor] = useState('#FFFFFF');
    const [strokeWidth, setStrokeWidth] = useState(4);
    const [tool, setTool] = useState('pen'); // 'pen', 'eraser'

    // Screen Share State
    const [shareOptionsVisible, setShareOptionsVisible] = useState(false);
    const [sharedContent, setSharedContent] = useState(null); // {type: 'image'|'document'|'url', uri: string, name?: string}
    const [isSharing, setIsSharing] = useState(false);
    const [shareLoading, setShareLoading] = useState(false);
    const [pdfViewerUrl, setPdfViewerUrl] = useState(null);
    const [screenCaptureUri, setScreenCaptureUri] = useState(null);
    const screenCaptureInterval = useRef(null);
    const viewShotRef = useRef(null);

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const chatScrollRef = useRef(null);

    // Refs to track current values for PanResponder (to avoid stale closures)
    const currentPathRef = useRef('');
    const strokeColorRef = useRef('#FFFFFF');
    const strokeWidthRef = useRef(4);
    const toolRef = useRef('pen');
    const viewModeRef = useRef('camera');

    // Update refs when state changes
    useEffect(() => { currentPathRef.current = currentPath; }, [currentPath]);
    useEffect(() => { strokeColorRef.current = strokeColor; }, [strokeColor]);
    useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);
    useEffect(() => { toolRef.current = tool; }, [tool]);
    useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

    // Pan responder for whiteboard drawing
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => viewModeRef.current === 'whiteboard',
            onMoveShouldSetPanResponder: () => viewModeRef.current === 'whiteboard',
            onPanResponderGrant: (evt) => {
                const { locationX, locationY } = evt.nativeEvent;
                const newPath = `M${locationX},${locationY}`;
                currentPathRef.current = newPath;
                setCurrentPath(newPath);
            },
            onPanResponderMove: (evt) => {
                const { locationX, locationY } = evt.nativeEvent;
                const newPath = `${currentPathRef.current} L${locationX},${locationY}`;
                currentPathRef.current = newPath;
                setCurrentPath(newPath);
            },
            onPanResponderRelease: () => {
                const pathToSave = currentPathRef.current;
                if (pathToSave && pathToSave.length > 0) {
                    const currentTool = toolRef.current;
                    const currentColor = strokeColorRef.current;
                    const currentWidth = strokeWidthRef.current;

                    setPaths(prev => [...prev, {
                        d: pathToSave,
                        color: currentTool === 'eraser' ? '#1E293B' : currentColor,
                        width: currentTool === 'eraser' ? 20 : currentWidth
                    }]);
                }
                currentPathRef.current = '';
                setCurrentPath('');
            },
        })
    ).current;

    useEffect(() => {
        if (meeting?.id && !hasJoined) {
            joinMeeting();
        }
    }, [meeting?.id]);

    // Meeting timer
    useEffect(() => {
        const interval = setInterval(() => {
            setMeetingDuration(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Pulse animation for live indicator
    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, []);

    // Cleanup screen capture on unmount
    useEffect(() => {
        return () => {
            if (screenCaptureInterval.current) {
                clearInterval(screenCaptureInterval.current);
            }
        };
    }, []);

    const formatDuration = (seconds) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const joinMeeting = async () => {
        try {
            const formData = new FormData();
            formData.append('user_email', userEmail || 'user@company.com');
            formData.append('user_name', userName || 'User');

            const response = await fetch(`${API_URL}/api/v1/meetings/${meeting.id}/join`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (result.status === 'success') {
                setParticipants(result.meeting?.participants || []);
                setHasJoined(true);
            }
        } catch (error) {
            console.error('Join meeting error:', error);
        }
    };

    const handleLeaveMeeting = async () => {
        Alert.alert(
            'Leave Meeting',
            'Are you sure you want to leave this meeting?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Leave',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const formData = new FormData();
                            formData.append('user_email', userEmail || 'user@company.com');

                            await fetch(`${API_URL}/api/v1/meetings/${meeting.id}/leave`, {
                                method: 'POST',
                                body: formData
                            });
                        } catch (error) {
                            console.error('Leave error:', error);
                        }
                        navigation.goBack();
                    }
                }
            ]
        );
    };

    const toggleCamera = () => {
        setFacing(current => (current === 'front' ? 'back' : 'front'));
    };

    const sendMessage = () => {
        if (!newMessage.trim()) return;

        const msg = {
            id: Date.now().toString(),
            sender: userName || 'You',
            text: newMessage.trim(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isMe: true
        };

        setMessages(prev => [...prev, msg]);
        setNewMessage('');

        setTimeout(() => {
            chatScrollRef.current?.scrollToEnd({ animated: true });
        }, 100);
    };

    const clearWhiteboard = () => {
        Alert.alert('Clear Whiteboard', 'Are you sure you want to clear all drawings?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: () => setPaths([]) }
        ]);
    };

    // ==========================================
    // TEAMS-LIKE SCREEN SHARING FUNCTIONS
    // ==========================================

    // Capture current screen
    const captureScreen = async () => {
        try {
            if (viewShotRef.current) {
                const uri = await captureRef(viewShotRef, {
                    format: 'jpg',
                    quality: 0.8,
                });
                setScreenCaptureUri(uri);
                return uri;
            }
        } catch (error) {
            console.error('Screen capture error:', error);
        }
        return null;
    };

    // Start continuous screen capture (like Teams screen share)
    const startScreenCapture = () => {
        // Initial capture
        captureScreen();

        // Capture every 2 seconds for live-ish sharing
        screenCaptureInterval.current = setInterval(() => {
            captureScreen();
        }, 2000);
    };

    // Stop screen capture
    const stopScreenCapture = () => {
        if (screenCaptureInterval.current) {
            clearInterval(screenCaptureInterval.current);
            screenCaptureInterval.current = null;
        }
        setScreenCaptureUri(null);
    };

    // Share entire screen (Teams-style) - WORKING IMPLEMENTATION
    const handleShareScreen = async () => {
        setShareOptionsVisible(false);

        Alert.alert(
            '📱 Share Screen',
            'Start sharing your screen with all participants?\n\nYour app screen will be captured and shared in real-time.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Start Sharing',
                    style: 'default',
                    onPress: () => {
                        setShareLoading(true);

                        // Small delay to ensure UI is ready
                        setTimeout(() => {
                            setIsSharing(true);
                            setSharedContent({ type: 'screen', name: 'Your Screen' });
                            setViewMode('screenshare');

                            // Start continuous screen capture
                            startScreenCapture();

                            setShareLoading(false);

                            // Notify participants
                            const shareMsg = {
                                id: Date.now().toString(),
                                sender: 'System',
                                text: `📱 ${userName || 'User'} started sharing their screen`,
                                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                isSystem: true
                            };
                            setMessages(prev => [...prev, shareMsg]);
                        }, 500);
                    }
                }
            ]
        );
    };

    // Share photo from gallery or camera (Teams-style)
    const handleSharePhoto = async (useCamera = false) => {
        setShareOptionsVisible(false);
        setShareLoading(true);

        try {
            let result;
            if (useCamera) {
                result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    quality: 0.8,
                    allowsEditing: true,
                });
            } else {
                result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    quality: 0.8,
                    allowsEditing: true,
                });
            }

            if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                setSharedContent({
                    type: 'image',
                    uri: asset.uri,
                    name: asset.fileName || 'Shared Image',
                    width: asset.width,
                    height: asset.height
                });
                setIsSharing(true);
                setViewMode('screenshare');

                // Notify participants
                const shareMsg = {
                    id: Date.now().toString(),
                    sender: 'System',
                    text: `📷 ${userName || 'User'} is sharing an image`,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    isSystem: true
                };
                setMessages(prev => [...prev, shareMsg]);
            }
        } catch (error) {
            console.error('Photo share error:', error);
            Alert.alert('Error', 'Failed to share photo. Please try again.');
        } finally {
            setShareLoading(false);
        }
    };

    // Share document/presentation (Teams-style)
    const handleShareDocument = async () => {
        setShareOptionsVisible(false);
        setShareLoading(true);

        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/*'],
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets?.[0]) {
                const doc = result.assets[0];
                const isPdf = doc.mimeType?.includes('pdf');
                const isImage = doc.mimeType?.includes('image');

                setSharedContent({
                    type: isPdf ? 'document' : isImage ? 'image' : 'document',
                    uri: doc.uri,
                    name: doc.name || 'Shared Document',
                    mimeType: doc.mimeType
                });
                setIsSharing(true);
                setViewMode('screenshare');

                // For PDFs, use Google Docs viewer
                if (isPdf) {
                    // Note: For local files, you'd need to upload first
                    setPdfViewerUrl(doc.uri);
                }

                // Notify participants
                const shareMsg = {
                    id: Date.now().toString(),
                    sender: 'System',
                    text: `📄 ${userName || 'User'} is sharing: ${doc.name}`,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    isSystem: true
                };
                setMessages(prev => [...prev, shareMsg]);
            }
        } catch (error) {
            console.error('Document share error:', error);
            Alert.alert('Error', 'Failed to share document. Please try again.');
        } finally {
            setShareLoading(false);
        }
    };

    // Stop sharing (Teams-style)
    const stopSharing = () => {
        // Stop screen capture if running
        stopScreenCapture();

        setIsSharing(false);
        setSharedContent(null);
        setPdfViewerUrl(null);
        setViewMode('camera');

        // Notify participants
        const stopMsg = {
            id: Date.now().toString(),
            sender: 'System',
            text: `${userName || 'User'} stopped sharing`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSystem: true
        };
        setMessages(prev => [...prev, stopMsg]);
    };

    // Open share options (Teams-style bottom sheet)
    const openShareOptions = () => {
        if (isSharing) {
            // If already sharing, ask to stop
            Alert.alert(
                'Stop Sharing?',
                'You are currently sharing content. Do you want to stop?',
                [
                    { text: 'Keep Sharing', style: 'cancel' },
                    { text: 'Stop Sharing', style: 'destructive', onPress: stopSharing }
                ]
            );
        } else {
            setShareOptionsVisible(true);
        }
    };

    // Request camera permission
    useEffect(() => {
        if (!permission?.granted) {
            requestPermission();
        }
    }, [permission]);

    if (!meeting) {
        return (
            <SafeAreaView style={styles.errorContainer}>
                <MaterialCommunityIcons name="video-off" size={64} color="#6B7280" />
                <Text style={styles.errorText}>Meeting not found</Text>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backButtonText}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    // Combine host with participants
    const allParticipants = [
        { user_name: meeting.host_name, isHost: true },
        ...participants.filter(p => p.user_name !== meeting.host_name)
    ];

    const renderMessage = ({ item }) => (
        <View style={[styles.messageContainer, item.isMe && styles.messageContainerMe]}>
            {!item.isMe && (
                <View style={[styles.messageAvatar, item.isHost && styles.messageAvatarHost]}>
                    <Text style={styles.messageAvatarText}>{item.sender?.charAt(0)}</Text>
                </View>
            )}
            <View style={[styles.messageBubble, item.isMe ? styles.messageBubbleMe : styles.messageBubbleOther]}>
                {!item.isMe && <Text style={styles.messageSender}>{item.sender}</Text>}
                <Text style={[styles.messageText, item.isMe && styles.messageTextMe]}>{item.text}</Text>
                <Text style={[styles.messageTime, item.isMe && styles.messageTimeMe]}>{item.time}</Text>
            </View>
        </View>
    );

    const renderMainContent = () => {
        switch (viewMode) {
            case 'whiteboard':
                return (
                    <View style={styles.whiteboardContainer}>
                        {/* Whiteboard Header */}
                        <View style={styles.whiteboardHeader}>
                            <Text style={styles.whiteboardTitle}>📝 Whiteboard</Text>
                            <View style={styles.whiteboardActions}>
                                <TouchableOpacity onPress={() => setTool('pen')} style={[styles.toolBtn, tool === 'pen' && styles.toolBtnActive]}>
                                    <Feather name="edit-2" size={18} color={tool === 'pen' ? '#FFF' : '#A5B4FC'} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setTool('eraser')} style={[styles.toolBtn, tool === 'eraser' && styles.toolBtnActive]}>
                                    <MaterialCommunityIcons name="eraser" size={18} color={tool === 'eraser' ? '#FFF' : '#A5B4FC'} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={clearWhiteboard} style={styles.toolBtn}>
                                    <Feather name="trash-2" size={18} color="#EF4444" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setViewMode('camera')} style={styles.closeWhiteboardBtn}>
                                    <Feather name="x" size={20} color="#FFF" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Drawing Canvas */}
                        <View style={styles.canvas} {...panResponder.panHandlers}>
                            <Svg style={StyleSheet.absoluteFill}>
                                {paths.map((path, index) => (
                                    <Path
                                        key={index}
                                        d={path.d}
                                        stroke={path.color}
                                        strokeWidth={path.width}
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                ))}
                                {currentPath && (
                                    <Path
                                        d={currentPath}
                                        stroke={tool === 'eraser' ? '#1E293B' : strokeColor}
                                        strokeWidth={tool === 'eraser' ? 20 : strokeWidth}
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                )}
                            </Svg>
                        </View>

                        {/* Color Picker */}
                        <View style={styles.colorPicker}>
                            <Text style={styles.pickerLabel}>Color:</Text>
                            {COLORS.map((color) => (
                                <TouchableOpacity
                                    key={color}
                                    style={[styles.colorBtn, { backgroundColor: color }, strokeColor === color && styles.colorBtnActive]}
                                    onPress={() => setStrokeColor(color)}
                                />
                            ))}
                        </View>

                        {/* Stroke Width Picker */}
                        <View style={styles.strokePicker}>
                            <Text style={styles.pickerLabel}>Size:</Text>
                            {STROKE_WIDTHS.map((sw) => (
                                <TouchableOpacity
                                    key={sw}
                                    style={[styles.strokeBtn, strokeWidth === sw && styles.strokeBtnActive]}
                                    onPress={() => setStrokeWidth(sw)}
                                >
                                    <View style={[styles.strokePreview, { width: sw * 2, height: sw * 2 }]} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                );

            case 'screenshare':
                return (
                    <View style={styles.screenShareContainer}>
                        {/* Header with sharing info */}
                        <View style={styles.shareHeader}>
                            <View style={styles.shareHeaderLeft}>
                                <View style={styles.shareLiveIndicator}>
                                    <Animated.View style={[styles.shareLiveDot, { transform: [{ scale: pulseAnim }] }]} />
                                    <Text style={styles.shareLiveText}>SHARING</Text>
                                </View>
                                <Text style={styles.shareContentName} numberOfLines={1}>
                                    {sharedContent?.name || 'Screen'}
                                </Text>
                            </View>
                            <View style={styles.shareViewerCount}>
                                <MaterialCommunityIcons name="eye" size={16} color="#10B981" />
                                <Text style={styles.shareViewerText}>{allParticipants.length}</Text>
                            </View>
                        </View>

                        {/* Shared Content Display */}
                        <View style={styles.sharedContentArea}>
                            {sharedContent?.type === 'image' ? (
                                // Display shared image
                                <Image
                                    source={{ uri: sharedContent.uri }}
                                    style={styles.sharedImage}
                                    resizeMode="contain"
                                />
                            ) : sharedContent?.type === 'document' ? (
                                // Display document (PDF/PPT)
                                <View style={styles.documentPreview}>
                                    {sharedContent.mimeType?.includes('pdf') ? (
                                        <WebView
                                            source={{ uri: sharedContent.uri }}
                                            style={styles.pdfWebView}
                                            startInLoadingState
                                            renderLoading={() => (
                                                <View style={styles.loadingContainer}>
                                                    <ActivityIndicator size="large" color="#6366F1" />
                                                    <Text style={styles.loadingText}>Loading document...</Text>
                                                </View>
                                            )}
                                        />
                                    ) : (
                                        <View style={styles.documentPlaceholder}>
                                            <MaterialCommunityIcons name="file-document-outline" size={80} color="#6366F1" />
                                            <Text style={styles.documentName}>{sharedContent.name}</Text>
                                            <Text style={styles.documentHint}>Document is being shared with participants</Text>
                                        </View>
                                    )}
                                </View>
                            ) : sharedContent?.type === 'screen' && screenCaptureUri ? (
                                // Display captured screen - LIVE SCREEN SHARE
                                <View style={styles.screenCaptureContainer}>
                                    <Image
                                        source={{ uri: screenCaptureUri }}
                                        style={styles.capturedScreen}
                                        resizeMode="contain"
                                    />
                                    <View style={styles.screenCaptureOverlay}>
                                        <View style={styles.screenCaptureBadge}>
                                            <Animated.View style={[styles.shareLiveDot, { transform: [{ scale: pulseAnim }] }]} />
                                            <Text style={styles.screenCaptureBadgeText}>LIVE</Text>
                                        </View>
                                    </View>
                                </View>
                            ) : (
                                // Default screen share view (waiting for capture)
                                <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.screenShareGradient}>
                                    <View style={styles.screenShareIcon}>
                                        <ActivityIndicator size="large" color="#6366F1" />
                                    </View>
                                    <Text style={styles.screenShareTitle}>Starting Screen Share...</Text>
                                    <Text style={styles.screenShareSubtitle}>
                                        Preparing to share your screen
                                    </Text>
                                    <View style={styles.shareInfoCard}>
                                        <Feather name="info" size={16} color="#6366F1" />
                                        <Text style={styles.shareInfoHint}>
                                            Notifications and sensitive content may be visible
                                        </Text>
                                    </View>
                                </LinearGradient>
                            )}
                        </View>

                        {/* Stop Sharing Button - Teams Style */}
                        <TouchableOpacity style={styles.stopShareBtn} onPress={stopSharing}>
                            <LinearGradient
                                colors={['#EF4444', '#DC2626']}
                                style={styles.stopShareGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <MaterialCommunityIcons name="stop-circle-outline" size={20} color="#FFF" />
                                <Text style={styles.stopShareText}>Stop Presenting</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                );

            default: // camera
                return (
                    <ViewShot ref={viewShotRef} style={styles.mainVideoWrapper} options={{ format: 'jpg', quality: 0.8 }}>
                        <LinearGradient
                            colors={['rgba(99, 102, 241, 0.1)', 'rgba(139, 92, 246, 0.1)']}
                            style={styles.videoGlow}
                        />
                        <View style={styles.mainVideo}>
                            {permission?.granted && !isVideoOff ? (
                                <CameraView style={styles.camera} facing={facing}>
                                    <View style={styles.cameraFrame}>
                                        <View style={[styles.corner, styles.cornerTL]} />
                                        <View style={[styles.corner, styles.cornerTR]} />
                                        <View style={[styles.corner, styles.cornerBL]} />
                                        <View style={[styles.corner, styles.cornerBR]} />
                                    </View>

                                    <View style={styles.videoLabel}>
                                        <View style={styles.labelContent}>
                                            {isMuted && <Feather name="mic-off" size={12} color="#EF4444" style={{ marginRight: 4 }} />}
                                            <Text style={styles.labelText}>You</Text>
                                        </View>
                                    </View>
                                </CameraView>
                            ) : (
                                <LinearGradient colors={['#1E293B', '#334155']} style={styles.videoOffContainer}>
                                    <View style={styles.avatarLarge}>
                                        <Text style={styles.avatarLargeText}>{(userName || 'U').charAt(0)}</Text>
                                    </View>
                                    <Text style={styles.videoOffLabel}>
                                        {!permission?.granted ? 'Enable Camera' : 'Camera Off'}
                                    </Text>
                                </LinearGradient>
                            )}
                        </View>
                    </ViewShot>
                );
        }
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#0F172A', '#1E1B4B', '#0F172A']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* Header */}
            <SafeAreaView edges={['top']} style={styles.headerSafe}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleLeaveMeeting} style={styles.backBtn}>
                        <Feather name="chevron-left" size={28} color="#FFF" />
                    </TouchableOpacity>

                    <View style={styles.headerCenter}>
                        <View style={styles.titleRow}>
                            <Animated.View style={[styles.liveDotContainer, { transform: [{ scale: pulseAnim }] }]}>
                                <View style={styles.liveDot} />
                            </Animated.View>
                            <Text style={styles.meetingTitle} numberOfLines={1}>{meeting.title}</Text>
                        </View>
                        <Text style={styles.hostText}>{meeting.host_name} • {formatDuration(meetingDuration)}</Text>
                    </View>

                    <TouchableOpacity style={styles.participantsBtn}>
                        <Ionicons name="people" size={20} color="#FFF" />
                        <View style={styles.participantsBadge}>
                            <Text style={styles.participantsBadgeText}>{allParticipants.length}</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {/* Main Content */}
            <View style={styles.videoArea}>
                {renderMainContent()}

                {/* Participant Pills - only show when not in whiteboard */}
                {viewMode !== 'whiteboard' && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.participantsPills}
                        contentContainerStyle={styles.participantsPillsContent}
                    >
                        {allParticipants.map((p, idx) => (
                            <View key={idx} style={styles.participantPill}>
                                <LinearGradient
                                    colors={p.isHost ? ['#6366F1', '#8B5CF6'] : ['#374151', '#4B5563']}
                                    style={styles.participantPillGradient}
                                >
                                    <View style={styles.pillAvatar}>
                                        <Text style={styles.pillAvatarText}>{p.user_name?.charAt(0)}</Text>
                                    </View>
                                    <Text style={styles.pillName} numberOfLines={1}>{p.user_name}</Text>
                                    {p.isHost && <MaterialCommunityIcons name="crown" size={12} color="#D71A21" />}
                                </LinearGradient>
                            </View>
                        ))}
                    </ScrollView>
                )}

                {/* Room Info */}
                {viewMode === 'camera' && (
                    <View style={styles.roomInfo}>
                        <View style={styles.roomIdPill}>
                            <MaterialCommunityIcons name="link-variant" size={14} color="#818CF8" />
                            <Text style={styles.roomIdText}>{meeting.room_id}</Text>
                        </View>
                    </View>
                )}
            </View>

            {/* Control Bar */}
            <SafeAreaView edges={['bottom']} style={styles.controlBarSafe}>
                <BlurView intensity={80} tint="dark" style={styles.controlBar}>
                    <View style={styles.controlRow}>
                        {/* Mute */}
                        <TouchableOpacity
                            style={[styles.controlBtn, isMuted && styles.controlBtnDanger]}
                            onPress={() => setIsMuted(!isMuted)}
                        >
                            <Feather name={isMuted ? 'mic-off' : 'mic'} size={22} color="#FFF" />
                            <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
                        </TouchableOpacity>

                        {/* Video */}
                        <TouchableOpacity
                            style={[styles.controlBtn, isVideoOff && styles.controlBtnDanger]}
                            onPress={() => setIsVideoOff(!isVideoOff)}
                        >
                            <Feather name={isVideoOff ? 'video-off' : 'video'} size={22} color="#FFF" />
                            <Text style={styles.controlLabel}>{isVideoOff ? 'Start' : 'Stop'}</Text>
                        </TouchableOpacity>

                        {/* Screen Share */}
                        <TouchableOpacity
                            style={[styles.controlBtn, isSharing && styles.controlBtnActive]}
                            onPress={openShareOptions}
                        >
                            <MaterialCommunityIcons
                                name={isSharing ? "monitor-share" : "monitor-share"}
                                size={22}
                                color={isSharing ? "#10B981" : "#FFF"}
                            />
                            <Text style={styles.controlLabel}>{isSharing ? 'Sharing' : 'Share'}</Text>
                        </TouchableOpacity>

                        {/* Whiteboard */}
                        <TouchableOpacity
                            style={[styles.controlBtn, viewMode === 'whiteboard' && styles.controlBtnActive]}
                            onPress={() => setViewMode(viewMode === 'whiteboard' ? 'camera' : 'whiteboard')}
                        >
                            <MaterialCommunityIcons name="draw" size={22} color="#FFF" />
                            <Text style={styles.controlLabel}>Board</Text>
                        </TouchableOpacity>

                        {/* Chat */}
                        <TouchableOpacity style={styles.controlBtn} onPress={() => setChatVisible(true)}>
                            <View>
                                <Ionicons name="chatbubble-ellipses-outline" size={22} color="#FFF" />
                                {messages.length > 1 && (
                                    <View style={styles.chatBadge}>
                                        <Text style={styles.chatBadgeText}>{messages.length - 1}</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.controlLabel}>Chat</Text>
                        </TouchableOpacity>

                        {/* Leave */}
                        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveMeeting}>
                            <Feather name="phone-off" size={22} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                </BlurView>
            </SafeAreaView>

            {/* Chat Modal */}
            <Modal visible={chatVisible} animationType="slide" transparent>
                <View style={styles.chatOverlay}>
                    <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.chatContainer}
                    >
                        <View style={styles.chatHeader}>
                            <Text style={styles.chatTitle}>Meeting Chat</Text>
                            <TouchableOpacity onPress={() => setChatVisible(false)} style={styles.chatClose}>
                                <Feather name="x" size={24} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            ref={chatScrollRef}
                            data={messages}
                            renderItem={renderMessage}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.messagesList}
                            showsVerticalScrollIndicator={false}
                        />

                        <View style={styles.chatInputContainer}>
                            <TextInput
                                style={styles.chatInput}
                                placeholder="Type a message..."
                                placeholderTextColor="#6B7280"
                                value={newMessage}
                                onChangeText={setNewMessage}
                                multiline
                                maxLength={500}
                            />
                            <TouchableOpacity
                                style={[styles.sendBtn, !newMessage.trim() && styles.sendBtnDisabled]}
                                onPress={sendMessage}
                                disabled={!newMessage.trim()}
                            >
                                <Ionicons name="send" size={20} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* TEAMS-STYLE SHARE OPTIONS MODAL */}
            <Modal visible={shareOptionsVisible} animationType="slide" transparent>
                <View style={styles.shareModalOverlay}>
                    <TouchableOpacity
                        style={styles.shareModalBackdrop}
                        onPress={() => setShareOptionsVisible(false)}
                        activeOpacity={1}
                    />
                    <View style={styles.shareModalContainer}>
                        <View style={styles.shareModalHandle} />
                        <Text style={styles.shareModalTitle}>Share content</Text>
                        <Text style={styles.shareModalSubtitle}>Choose what you want to share with participants</Text>

                        <View style={styles.shareOptionsGrid}>
                            {/* Share Screen */}
                            <TouchableOpacity style={styles.shareOption} onPress={handleShareScreen}>
                                <View style={[styles.shareOptionIcon, { backgroundColor: '#EEF2FF' }]}>
                                    <MaterialCommunityIcons name="cellphone-screenshot" size={28} color="#6366F1" />
                                </View>
                                <Text style={styles.shareOptionLabel}>Screen</Text>
                            </TouchableOpacity>

                            {/* Share Photo from Gallery */}
                            <TouchableOpacity style={styles.shareOption} onPress={() => handleSharePhoto(false)}>
                                <View style={[styles.shareOptionIcon, { backgroundColor: '#ECFDF5' }]}>
                                    <MaterialCommunityIcons name="image-multiple" size={28} color="#10B981" />
                                </View>
                                <Text style={styles.shareOptionLabel}>Photo</Text>
                            </TouchableOpacity>

                            {/* Take Photo */}
                            <TouchableOpacity style={styles.shareOption} onPress={() => handleSharePhoto(true)}>
                                <View style={[styles.shareOptionIcon, { backgroundColor: '#FEF3C7' }]}>
                                    <MaterialCommunityIcons name="camera" size={28} color="#D71A21" />
                                </View>
                                <Text style={styles.shareOptionLabel}>Camera</Text>
                            </TouchableOpacity>

                            {/* Share Document */}
                            <TouchableOpacity style={styles.shareOption} onPress={handleShareDocument}>
                                <View style={[styles.shareOptionIcon, { backgroundColor: '#FEE2E2' }]}>
                                    <MaterialCommunityIcons name="file-document-outline" size={28} color="#EF4444" />
                                </View>
                                <Text style={styles.shareOptionLabel}>Document</Text>
                            </TouchableOpacity>

                            {/* Share Whiteboard */}
                            <TouchableOpacity style={styles.shareOption} onPress={() => {
                                setShareOptionsVisible(false);
                                setViewMode('whiteboard');
                            }}>
                                <View style={[styles.shareOptionIcon, { backgroundColor: '#E0E7FF' }]}>
                                    <MaterialCommunityIcons name="draw" size={28} color="#4F46E5" />
                                </View>
                                <Text style={styles.shareOptionLabel}>Whiteboard</Text>
                            </TouchableOpacity>

                            {/* Share PowerPoint */}
                            <TouchableOpacity style={styles.shareOption} onPress={handleShareDocument}>
                                <View style={[styles.shareOptionIcon, { backgroundColor: '#FFF7ED' }]}>
                                    <MaterialCommunityIcons name="file-powerpoint-box" size={28} color="#EA580C" />
                                </View>
                                <Text style={styles.shareOptionLabel}>PowerPoint</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={styles.shareModalCancel}
                            onPress={() => setShareOptionsVisible(false)}
                        >
                            <Text style={styles.shareModalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Loading Overlay */}
            {shareLoading && (
                <View style={styles.loadingOverlay}>
                    <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                    <ActivityIndicator size="large" color="#6366F1" />
                    <Text style={styles.loadingOverlayText}>Preparing to share...</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    // Header styles
    headerSafe: { zIndex: 10 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    headerCenter: { flex: 1, marginHorizontal: 16 },
    titleRow: { flexDirection: 'row', alignItems: 'center' },
    liveDotContainer: { marginRight: 8 },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
    meetingTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: '#FFF', flex: 1 },
    hostText: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#A5B4FC', marginTop: 2 },
    participantsBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    participantsBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: '#6366F1', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
    participantsBadgeText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },

    // Video Area
    videoArea: { flex: 1, padding: 16 },
    mainVideoWrapper: { flex: 1, marginBottom: 12 },
    videoGlow: { ...StyleSheet.absoluteFillObject, borderRadius: 28, transform: [{ scale: 1.02 }] },
    mainVideo: { flex: 1, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(99, 102, 241, 0.3)' },
    camera: { flex: 1 },
    cameraFrame: { ...StyleSheet.absoluteFillObject, padding: 20 },
    corner: { position: 'absolute', width: 30, height: 30, borderColor: 'rgba(255,255,255,0.4)' },
    cornerTL: { top: 20, left: 20, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 8 },
    cornerTR: { top: 20, right: 20, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 8 },
    cornerBL: { bottom: 20, left: 20, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 8 },
    cornerBR: { bottom: 20, right: 20, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 8 },
    videoLabel: { position: 'absolute', bottom: 16, left: 16 },
    labelContent: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    labelText: { color: '#FFF', fontSize: 13, fontFamily: 'Poppins_500Medium' },
    videoOffContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    avatarLarge: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    avatarLargeText: { fontSize: 40, fontFamily: 'Poppins_700Bold', color: '#FFF' },
    videoOffLabel: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#94A3B8' },

    // Whiteboard
    whiteboardContainer: { flex: 1, backgroundColor: '#1E293B', borderRadius: 24, overflow: 'hidden' },
    whiteboardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#0F172A' },
    whiteboardTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    whiteboardActions: { flexDirection: 'row', gap: 8 },
    toolBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    toolBtnActive: { backgroundColor: '#6366F1' },
    closeWhiteboardBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(239, 68, 68, 0.3)', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
    canvas: { flex: 1, backgroundColor: '#1E293B' },
    colorPicker: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#0F172A', gap: 8 },
    pickerLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#94A3B8', marginRight: 4 },
    colorBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
    colorBtnActive: { borderColor: '#FFF', transform: [{ scale: 1.2 }] },
    strokePicker: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#0F172A', gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
    strokeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    strokeBtnActive: { backgroundColor: '#6366F1' },
    strokePreview: { backgroundColor: '#FFF', borderRadius: 20 },

    // Screen Share
    screenShareContainer: { flex: 1, borderRadius: 24, overflow: 'hidden' },
    screenShareGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    screenShareIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(99, 102, 241, 0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    screenShareTitle: { fontSize: 20, fontFamily: 'Poppins_600SemiBold', color: '#FFF', marginBottom: 8 },
    screenShareSubtitle: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#94A3B8', textAlign: 'center', marginBottom: 24 },
    shareInfoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, gap: 8, marginBottom: 24 },
    shareInfoText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#10B981' },
    stopShareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF4444', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24, gap: 10 },
    stopShareText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },

    // Participant Pills
    participantsPills: { maxHeight: 56, marginBottom: 12 },
    participantsPillsContent: { gap: 10 },
    participantPill: { borderRadius: 25, overflow: 'hidden' },
    participantPillGradient: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, gap: 8 },
    pillAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    pillAvatarText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    pillName: { fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#FFF', maxWidth: 80 },
    roomInfo: { alignItems: 'center' },
    roomIdPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(99, 102, 241, 0.15)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6 },
    roomIdText: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#A5B4FC' },

    // Control Bar
    controlBarSafe: { backgroundColor: 'transparent' },
    controlBar: { marginHorizontal: 16, marginBottom: Platform.OS === 'android' ? 16 : 0, borderRadius: 28, overflow: 'hidden' },
    controlRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
    controlBtn: { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10 },
    controlBtnActive: { backgroundColor: 'rgba(99, 102, 241, 0.4)', borderRadius: 16 },
    controlBtnDanger: { backgroundColor: 'rgba(239, 68, 68, 0.3)', borderRadius: 16 },
    controlLabel: { fontSize: 9, fontFamily: 'Poppins_500Medium', color: '#A5B4FC', marginTop: 2 },
    chatBadge: { position: 'absolute', top: -4, right: -8, backgroundColor: '#6366F1', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    chatBadgeText: { fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    leaveBtn: { backgroundColor: '#EF4444', padding: 12, borderRadius: 20 },

    // Chat Modal
    chatOverlay: { flex: 1, justifyContent: 'flex-end' },
    chatContainer: { height: '75%', backgroundColor: 'rgba(15, 23, 42, 0.95)', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
    chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
    chatTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    chatClose: { padding: 8 },
    messagesList: { padding: 16 },
    messageContainer: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
    messageContainerMe: { justifyContent: 'flex-end' },
    messageAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#374151', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
    messageAvatarHost: { backgroundColor: '#6366F1' },
    messageAvatarText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },
    messageBubble: { maxWidth: '75%', padding: 12, borderRadius: 16 },
    messageBubbleOther: { backgroundColor: '#1E293B', borderBottomLeftRadius: 4 },
    messageBubbleMe: { backgroundColor: '#6366F1', borderBottomRightRadius: 4 },
    messageSender: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: '#A5B4FC', marginBottom: 4 },
    messageText: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#E2E8F0' },
    messageTextMe: { color: '#FFF' },
    messageTime: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#64748B', marginTop: 4, textAlign: 'right' },
    messageTimeMe: { color: 'rgba(255,255,255,0.7)' },
    chatInputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', gap: 12 },
    chatInput: { flex: 1, backgroundColor: '#1E293B', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#FFF', maxHeight: 100 },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
    sendBtnDisabled: { backgroundColor: '#374151' },

    // Error State
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
    errorText: { fontSize: 18, fontFamily: 'Poppins_500Medium', color: '#6B7280', marginTop: 16 },
    backButton: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#6366F1', borderRadius: 12 },
    backButtonText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },

    // ==========================================
    // TEAMS-STYLE SCREEN SHARING STYLES
    // ==========================================

    // Share Header
    shareHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24
    },
    shareHeaderLeft: { flexDirection: 'column' },
    shareLiveIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    shareLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 6 },
    shareLiveText: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#EF4444', letterSpacing: 1 },
    shareContentName: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#FFF', maxWidth: 200 },
    shareViewerCount: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 4 },
    shareViewerText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#10B981' },

    // Shared Content Area
    sharedContentArea: { flex: 1, backgroundColor: '#0F172A' },
    sharedImage: { flex: 1, width: '100%' },
    documentPreview: { flex: 1 },
    pdfWebView: { flex: 1 },
    documentPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E293B' },
    documentName: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', color: '#FFF', marginTop: 16, textAlign: 'center', paddingHorizontal: 20 },
    documentHint: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#94A3B8', marginTop: 8, textAlign: 'center' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
    loadingText: { fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#94A3B8', marginTop: 12 },
    shareInfoHint: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: '#94A3B8', marginLeft: 8 },

    // Screen Capture Display
    screenCaptureContainer: { flex: 1, backgroundColor: '#0F172A', position: 'relative' },
    capturedScreen: { flex: 1, width: '100%', borderRadius: 12 },
    screenCaptureOverlay: { position: 'absolute', top: 12, right: 12 },
    screenCaptureBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 6
    },
    screenCaptureBadgeText: { fontSize: 11, fontFamily: 'Poppins_700Bold', color: '#FFF', letterSpacing: 1 },

    // Stop Share Button
    stopShareBtn: { marginHorizontal: 20, marginVertical: 16, borderRadius: 24, overflow: 'hidden' },
    stopShareGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
    stopShareText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#FFF' },

    // Share Modal (Teams-style bottom sheet)
    shareModalOverlay: { flex: 1, justifyContent: 'flex-end' },
    shareModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    shareModalContainer: {
        backgroundColor: '#0F172A',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        paddingTop: 12
    },
    shareModalHandle: { width: 40, height: 4, backgroundColor: '#374151', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
    shareModalTitle: { fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#FFF', textAlign: 'center' },
    shareModalSubtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: '#94A3B8', textAlign: 'center', marginTop: 4, marginBottom: 24 },

    // Share Options Grid
    shareOptionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 24,
        justifyContent: 'space-between'
    },
    shareOption: {
        width: (width - 80) / 3,
        alignItems: 'center',
        marginBottom: 24
    },
    shareOptionIcon: {
        width: 60,
        height: 60,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8
    },
    shareOptionLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#E2E8F0' },

    // Cancel Button
    shareModalCancel: {
        marginHorizontal: 24,
        marginTop: 8,
        paddingVertical: 14,
        backgroundColor: '#1E293B',
        borderRadius: 16,
        alignItems: 'center'
    },
    shareModalCancelText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#94A3B8' },

    // Loading Overlay
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999
    },
    loadingOverlayText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: '#FFF', marginTop: 16 },
});
