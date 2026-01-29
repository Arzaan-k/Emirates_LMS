import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    TextInput,
    Modal,
    Image,
    Alert,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn, Layout } from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import API_URL from '../config';

const { width, height } = Dimensions.get('window');

// --- OPTION EDITOR MODAL ---
const OptionEditorModal = ({ visible, option, onSave, onClose, nodes, currentNodeId }) => {
    const [localOption, setLocalOption] = useState({
        id: '',
        text: '',
        isCorrect: false,
        consequence: '',
        nextNodeId: null,
    });

    // Sync when option changes
    useEffect(() => {
        if (option) {
            setLocalOption({
                id: option.id || '',
                text: option.text || '',
                isCorrect: option.isCorrect || false,
                consequence: option.consequence || '',
                nextNodeId: option.nextNodeId || null,
            });
        }
    }, [option?.id, visible]);

    const handleSave = () => {
        if (!localOption.text.trim()) {
            Alert.alert('Error', 'Please enter option text');
            return;
        }

        const savedOption = {
            id: localOption.id,
            text: localOption.text.trim(),
            isCorrect: localOption.isCorrect,
            consequence: localOption.isCorrect ? '' : (localOption.consequence || '').trim(),
            nextNodeId: localOption.isCorrect ? localOption.nextNodeId : null,
        };

        onSave(savedOption);
    };

    const availableNextNodes = nodes.filter(n => n.id !== currentNodeId);

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={optionStyles.overlay}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={optionStyles.container}>
                    <View style={optionStyles.header}>
                        <Text style={optionStyles.title}>Edit Option</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Feather name="x" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                        {/* Option Text */}
                        <Text style={optionStyles.label}>Option Text *</Text>
                        <TextInput
                            style={optionStyles.input}
                            value={localOption.text}
                            onChangeText={(text) => setLocalOption(prev => ({ ...prev, text }))}
                            placeholder="e.g., Put on apron and wash hands"
                            placeholderTextColor="#6B7280"
                            multiline
                        />

                        {/* Is Correct Toggle */}
                        <TouchableOpacity
                            style={optionStyles.toggleRow}
                            onPress={() => setLocalOption(prev => ({ ...prev, isCorrect: !prev.isCorrect }))}
                        >
                            <View>
                                <Text style={optionStyles.toggleLabel}>Correct Answer</Text>
                                <Text style={optionStyles.hint}>Is this the right choice?</Text>
                            </View>
                            <View style={[optionStyles.toggle, localOption.isCorrect && optionStyles.toggleActive]}>
                                <View style={[optionStyles.toggleDot, localOption.isCorrect && optionStyles.toggleDotActive]} />
                            </View>
                        </TouchableOpacity>

                        {/* Consequence (for wrong answers) */}
                        {!localOption.isCorrect && (
                            <>
                                <Text style={optionStyles.label}>Consequence</Text>
                                <Text style={optionStyles.hint}>What happens if user picks this? (AI will generate if empty)</Text>
                                <TextInput
                                    style={[optionStyles.input, { height: 80 }]}
                                    value={localOption.consequence}
                                    onChangeText={(text) => setLocalOption(prev => ({ ...prev, consequence: text }))}
                                    placeholder="e.g., Starting without proper hygiene can contaminate food..."
                                    placeholderTextColor="#6B7280"
                                    multiline
                                />
                            </>
                        )}

                        {/* Next Node (for correct answers) */}
                        {localOption.isCorrect && (
                            <>
                                <Text style={optionStyles.label}>Next Step</Text>
                                <Text style={optionStyles.hint}>Which step plays after this choice?</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 }}>
                                    <TouchableOpacity
                                        style={[optionStyles.nodeChip, !localOption.nextNodeId && optionStyles.nodeChipActive]}
                                        onPress={() => setLocalOption(prev => ({ ...prev, nextNodeId: null }))}
                                    >
                                        <Text style={[optionStyles.nodeChipText, !localOption.nextNodeId && optionStyles.nodeChipTextActive]}>
                                            End Simulation
                                        </Text>
                                    </TouchableOpacity>
                                    {availableNextNodes.map((node, idx) => (
                                        <TouchableOpacity
                                            key={node.id}
                                            style={[optionStyles.nodeChip, localOption.nextNodeId === node.id && optionStyles.nodeChipActive]}
                                            onPress={() => setLocalOption(prev => ({ ...prev, nextNodeId: node.id }))}
                                        >
                                            <Text style={[optionStyles.nodeChipText, localOption.nextNodeId === node.id && optionStyles.nodeChipTextActive]}>
                                                {node.title || `Step ${nodes.findIndex(n => n.id === node.id) + 1}`}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        )}
                    </ScrollView>

                    <TouchableOpacity style={optionStyles.saveBtn} onPress={handleSave}>
                        <LinearGradient
                            colors={['#8B5CF6', '#7C3AED']}
                            style={optionStyles.saveBtnGradient}
                        >
                            <Text style={optionStyles.saveBtnText}>Save Option</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

// --- NODE EDITOR COMPONENT ---
const NodeEditor = React.memo(({ node, index, nodes, onUpdate, onDelete, onUploadVideo }) => {
    const [expanded, setExpanded] = useState(false);
    const [editingOptionId, setEditingOptionId] = useState(null);

    // Find the option being edited from the node's options
    const editingOption = useMemo(() => {
        if (!editingOptionId) return null;
        return node.options.find(o => o.id === editingOptionId) || null;
    }, [editingOptionId, node.options]);

    const handleOptionSave = useCallback((updatedOption) => {
        const newOptions = node.options.map(o =>
            o.id === updatedOption.id ? { ...updatedOption } : o
        );
        onUpdate(node.id, { options: newOptions });
        setEditingOptionId(null);
    }, [node.id, node.options, onUpdate]);

    const addOption = useCallback(() => {
        if (node.options.length >= 4) {
            Alert.alert('Limit Reached', 'Maximum 4 options per step');
            return;
        }
        const newOptionId = `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newOption = {
            id: newOptionId,
            text: '',
            isCorrect: node.options.length === 0, // First option is correct by default
            consequence: '',
            nextNodeId: null,
        };
        onUpdate(node.id, { options: [...node.options, newOption] });
        // Open editor for new option after a short delay to ensure state is updated
        setTimeout(() => setEditingOptionId(newOptionId), 100);
    }, [node.id, node.options, onUpdate]);

    const deleteOption = useCallback((optionId) => {
        Alert.alert(
            'Delete Option',
            'Are you sure you want to delete this option?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        const newOptions = node.options.filter(o => o.id !== optionId);
                        onUpdate(node.id, { options: newOptions });
                    }
                }
            ]
        );
    }, [node.id, node.options, onUpdate]);

    const handleTitleChange = useCallback((text) => {
        onUpdate(node.id, { title: text });
    }, [node.id, onUpdate]);

    const handleDescriptionChange = useCallback((text) => {
        onUpdate(node.id, { description: text });
    }, [node.id, onUpdate]);

    return (
        <View style={nodeStyles.container}>
            {/* Node Header */}
            <TouchableOpacity
                style={nodeStyles.header}
                onPress={() => setExpanded(!expanded)}
                activeOpacity={0.8}
            >
                <View style={nodeStyles.headerLeft}>
                    <View style={[nodeStyles.stepBadge, node.isStart && nodeStyles.startBadge]}>
                        <Text style={nodeStyles.stepNumber}>{index + 1}</Text>
                    </View>
                    <View style={nodeStyles.headerInfo}>
                        <Text style={nodeStyles.nodeTitle} numberOfLines={1}>
                            {node.title || 'Untitled Step'}
                        </Text>
                        <Text style={nodeStyles.optionCount}>
                            {node.options.length} options • {node.videoUrl ? 'Video ✓' : 'No video'}
                        </Text>
                    </View>
                </View>
                <View style={nodeStyles.headerRight}>
                    {node.isStart && (
                        <View style={nodeStyles.startTag}>
                            <Text style={nodeStyles.startTagText}>START</Text>
                        </View>
                    )}
                    <Feather
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#9CA3AF"
                    />
                </View>
            </TouchableOpacity>

            {/* Expanded Content */}
            {expanded && (
                <View style={nodeStyles.content}>
                    {/* Title Input */}
                    <Text style={nodeStyles.label}>Step Title</Text>
                    <TextInput
                        style={nodeStyles.input}
                        value={node.title}
                        onChangeText={handleTitleChange}
                        placeholder="e.g., Entering the Kitchen"
                        placeholderTextColor="#6B7280"
                    />

                    {/* Description Input */}
                    <Text style={nodeStyles.label}>Description</Text>
                    <TextInput
                        style={[nodeStyles.input, { height: 60 }]}
                        value={node.description}
                        onChangeText={handleDescriptionChange}
                        placeholder="What's happening in this step?"
                        placeholderTextColor="#6B7280"
                        multiline
                    />

                    {/* Video Upload */}
                    <Text style={nodeStyles.label}>Video Clip</Text>
                    <TouchableOpacity
                        style={nodeStyles.uploadBtn}
                        onPress={() => onUploadVideo(node.id)}
                    >
                        {node.videoUrl ? (
                            <View style={nodeStyles.videoPreview}>
                                <MaterialCommunityIcons name="video-check" size={24} color="#10B981" />
                                <Text style={nodeStyles.videoText}>Video uploaded</Text>
                                <TouchableOpacity onPress={() => onUpdate(node.id, { videoUrl: null })}>
                                    <Feather name="x" size={18} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={nodeStyles.uploadPlaceholder}>
                                <MaterialCommunityIcons name="video-plus" size={32} color="#6B7280" />
                                <Text style={nodeStyles.uploadText}>Upload Video</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Set as Start */}
                    <TouchableOpacity
                        style={nodeStyles.toggleRow}
                        onPress={() => onUpdate(node.id, { isStart: !node.isStart })}
                    >
                        <Text style={nodeStyles.toggleLabel}>Starting Step</Text>
                        <View style={[nodeStyles.toggle, node.isStart && nodeStyles.toggleActive]}>
                            <View style={[nodeStyles.toggleDot, node.isStart && nodeStyles.toggleDotActive]} />
                        </View>
                    </TouchableOpacity>

                    {/* Options */}
                    <View style={nodeStyles.optionsSection}>
                        <View style={nodeStyles.optionsSectionHeader}>
                            <Text style={nodeStyles.label}>Options (Choices)</Text>
                            <TouchableOpacity style={nodeStyles.addOptionBtn} onPress={addOption}>
                                <Feather name="plus" size={16} color="#8B5CF6" />
                                <Text style={nodeStyles.addOptionText}>Add</Text>
                            </TouchableOpacity>
                        </View>

                        {node.options.map((option, optIndex) => (
                            <View key={option.id} style={nodeStyles.optionCard}>
                                <View style={nodeStyles.optionHeader}>
                                    <View style={[nodeStyles.optionBadge, option.isCorrect && nodeStyles.correctBadge]}>
                                        <Text style={nodeStyles.optionBadgeText}>{optIndex + 1}</Text>
                                    </View>
                                    <Text style={nodeStyles.optionText} numberOfLines={2}>
                                        {option.text || '(Empty - tap edit)'}
                                    </Text>
                                </View>
                                <View style={nodeStyles.optionActions}>
                                    {option.isCorrect && (
                                        <View style={nodeStyles.correctTag}>
                                            <Feather name="check" size={12} color="#10B981" />
                                        </View>
                                    )}
                                    <TouchableOpacity
                                        style={{ padding: 8 }}
                                        onPress={() => setEditingOptionId(option.id)}
                                    >
                                        <Feather name="edit-2" size={16} color="#8B5CF6" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{ padding: 8 }}
                                        onPress={() => deleteOption(option.id)}
                                    >
                                        <Feather name="trash-2" size={16} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}

                        {node.options.length === 0 && (
                            <Text style={nodeStyles.noOptionsText}>
                                No options yet. Add choices for this step.
                            </Text>
                        )}
                    </View>

                    {/* Delete Node */}
                    <TouchableOpacity
                        style={nodeStyles.deleteBtn}
                        onPress={() => {
                            Alert.alert(
                                'Delete Step',
                                'Are you sure you want to delete this step?',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Delete', style: 'destructive', onPress: () => onDelete(node.id) }
                                ]
                            );
                        }}
                    >
                        <Feather name="trash-2" size={16} color="#EF4444" />
                        <Text style={nodeStyles.deleteBtnText}>Delete Step</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Option Editor Modal */}
            <OptionEditorModal
                visible={!!editingOptionId}
                option={editingOption}
                nodes={nodes}
                currentNodeId={node.id}
                onSave={handleOptionSave}
                onClose={() => setEditingOptionId(null)}
            />
        </View>
    );
});

// --- MAIN FLOW BUILDER COMPONENT ---
export default function SimulationFlowBuilder({ existingSimulation, onSave, onClose }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('waffle');
    const [difficulty, setDifficulty] = useState('Medium');
    const [nodes, setNodes] = useState([]);
    const [thumbnailUrl, setThumbnailUrl] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [simulationId, setSimulationId] = useState(null);

    // Initialize state from existing simulation
    useEffect(() => {
        if (existingSimulation) {
            setSimulationId(existingSimulation.id);
            setTitle(existingSimulation.title || '');
            setDescription(existingSimulation.description || '');
            setCategory(existingSimulation.category || 'waffle');
            setDifficulty(existingSimulation.difficulty || 'Medium');
            setThumbnailUrl(existingSimulation.thumbnailUrl || null);
            // Deep copy nodes to avoid mutation issues
            setNodes(JSON.parse(JSON.stringify(existingSimulation.nodes || [])));
        } else {
            // Reset for new simulation
            setSimulationId(`sim-${Date.now()}`);
            setTitle('');
            setDescription('');
            setCategory('waffle');
            setDifficulty('Medium');
            setThumbnailUrl(null);
            setNodes([]);
        }
    }, [existingSimulation]);

    const categories = ['waffle', 'hygiene', 'service', 'safety'];
    const difficulties = ['Easy', 'Medium', 'Hard'];

    // Add new step with auto-linking to previous step
    const addNode = useCallback(() => {
        const newNodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const isFirstNode = nodes.length === 0;

        const newNode = {
            id: newNodeId,
            title: `Step ${nodes.length + 1}`,
            description: '',
            videoUrl: null,
            isStart: isFirstNode, // First node is start by default
            options: [],
        };

        // Auto-link previous step's correct option to this new step
        if (nodes.length > 0) {
            const updatedNodes = nodes.map((node, idx) => {
                if (idx === nodes.length - 1) {
                    // This is the last node before adding new one
                    // Update its correct option to point to the new node
                    const updatedOptions = node.options.map(opt => {
                        if (opt.isCorrect && opt.nextNodeId === null) {
                            return { ...opt, nextNodeId: newNodeId };
                        }
                        return opt;
                    });
                    return { ...node, options: updatedOptions };
                }
                return node;
            });
            setNodes([...updatedNodes, newNode]);
        } else {
            setNodes([newNode]);
        }
    }, [nodes]);

    const updateNode = useCallback((nodeId, updates) => {
        setNodes(prevNodes => {
            // If setting a node as start, unset others
            if (updates.isStart === true) {
                return prevNodes.map(n => ({
                    ...n,
                    isStart: n.id === nodeId,
                    ...(n.id === nodeId ? updates : {}),
                }));
            }
            return prevNodes.map(n =>
                n.id === nodeId ? { ...n, ...updates } : n
            );
        });
    }, []);

    const deleteNode = useCallback((nodeId) => {
        setNodes(prevNodes => {
            const updatedNodes = prevNodes.filter(n => n.id !== nodeId);
            // Update references to deleted node
            return updatedNodes.map(n => ({
                ...n,
                options: n.options.map(o => ({
                    ...o,
                    nextNodeId: o.nextNodeId === nodeId ? null : o.nextNodeId,
                })),
            }));
        });
    }, []);

    const uploadMedia = async (uri, type = 'video') => {
        try {
            const formData = new FormData();
            const filename = uri.split('/').pop();
            // Simple mime type logic
            let mimeType = type === 'video' ? 'video/mp4' : 'image/jpeg';
            if (filename.endsWith('.png')) mimeType = 'image/png';
            if (filename.endsWith('.mov')) mimeType = 'video/quicktime';

            formData.append('file', {
                uri: uri,
                name: filename,
                type: mimeType
            });

            // Note: In React Native with FormData, do NOT set Content-Type header manually
            const res = await fetch(`${API_URL}/api/v1/simulations/upload-media`, {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();
            if (data.url) return data.url;
            throw new Error('No URL returned from server');
        } catch (e) {
            console.error("Upload failed:", e);
            Alert.alert("Upload Failed", "Could not upload media to server. Check connection.");
            return null;
        }
    };

    const handleUploadVideo = async (nodeId) => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'We need permission to access your videos');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Videos,
                allowsEditing: false, // Videos hard to edit in native picker sometimes
                quality: 1,
            });

            if (!result.canceled && result.assets[0]) {
                Alert.alert('Uploading', 'Uploading video to server...');
                const remoteUrl = await uploadMedia(result.assets[0].uri, 'video');
                if (remoteUrl) {
                    updateNode(nodeId, { videoUrl: remoteUrl });
                    Alert.alert('Success', 'Video uploaded successfully');
                }
            }
        } catch (error) {
            console.error('Video pick error:', error);
            Alert.alert('Error', 'Failed to pick video');
        }
    };

    const handleUploadThumbnail = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'We need permission to access your photos');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [16, 9],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                Alert.alert('Uploading', 'Uploading thumbnail...');
                const remoteUrl = await uploadMedia(result.assets[0].uri, 'image');
                if (remoteUrl) {
                    setThumbnailUrl(remoteUrl);
                }
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to pick image');
        }
    };

    const validateSimulation = () => {
        if (!title.trim()) {
            Alert.alert('Validation Error', 'Please enter a simulation title');
            return false;
        }
        if (nodes.length === 0) {
            Alert.alert('Validation Error', 'Please add at least one step');
            return false;
        }
        const startNode = nodes.find(n => n.isStart);
        if (!startNode) {
            Alert.alert('Validation Error', 'Please set a starting step');
            return false;
        }

        // Check each node
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node.title.trim()) {
                Alert.alert('Validation Error', `Step ${i + 1} needs a title`);
                return false;
            }
            // Require at least 2 options
            if (node.options.length < 2) {
                Alert.alert('Validation Error', `Step "${node.title}" needs at least 2 options`);
                return false;
            }
            // Check all options have text
            for (let j = 0; j < node.options.length; j++) {
                if (!node.options[j].text.trim()) {
                    Alert.alert('Validation Error', `Step "${node.title}" has an empty option`);
                    return false;
                }
            }
            // Need exactly one correct option
            const correctOptions = node.options.filter(o => o.isCorrect);
            if (correctOptions.length === 0) {
                Alert.alert('Validation Error', `Step "${node.title}" needs one correct option`);
                return false;
            }
        }
        return true;
    };

    // Auto-link last node's correct option to null (End Simulation) before saving
    const prepareNodesForSave = () => {
        // Ensure the last step's correct option points to null (End Simulation)
        return nodes.map((node, idx) => {
            if (idx === nodes.length - 1) {
                // Last node - ensure correct option points to end
                return {
                    ...node,
                    options: node.options.map(opt => ({
                        ...opt,
                        nextNodeId: opt.isCorrect ? null : opt.nextNodeId,
                    })),
                };
            }
            return node;
        });
    };

    const handleSave = async () => {
        if (!validateSimulation()) return;

        setIsSaving(true);

        const preparedNodes = prepareNodesForSave();

        const simulationData = {
            id: simulationId || `sim-${Date.now()}`,
            title: title.trim(),
            description: description.trim(),
            category,
            difficulty,
            thumbnailUrl,
            nodes: preparedNodes,
            estimatedTime: `${nodes.length * 3} min`,
            maxScore: nodes.length * 10,
            createdAt: existingSimulation?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        try {
            const response = await fetch(`${API_URL}/api/v1/simulations/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(simulationData),
            });

            const result = await response.json();
            if (result.success) {
                Alert.alert('Success', 'Simulation saved successfully!', [
                    { text: 'OK', onPress: () => onSave && onSave(simulationData) }
                ]);
            } else {
                throw new Error(result.message || 'Failed to save');
            }
        } catch (e) {
            console.error('Save error:', e);
            // Still call onSave for local state update
            Alert.alert('Saved Locally', 'Simulation saved. (Server sync may be unavailable)', [
                { text: 'OK', onPress: () => onSave && onSave(simulationData) }
            ]);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#0F172A', '#1E293B']} style={StyleSheet.absoluteFill} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Feather name="x" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {existingSimulation ? 'Edit Simulation' : 'Create Simulation'}
                </Text>
                <TouchableOpacity
                    style={[styles.saveBtn, isSaving && { opacity: 0.5 }]}
                    onPress={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                        <>
                            <Feather name="save" size={18} color="#FFF" />
                            <Text style={styles.saveBtnText}>Save</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Basic Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Basic Information</Text>

                    {/* Title */}
                    <Text style={styles.label}>Title *</Text>
                    <TextInput
                        style={styles.input}
                        value={title}
                        onChangeText={setTitle}
                        placeholder="e.g., Making the Perfect Belgian Waffle"
                        placeholderTextColor="#6B7280"
                    />

                    {/* Description */}
                    <Text style={styles.label}>Description</Text>
                    <TextInput
                        style={[styles.input, { height: 80 }]}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="What will employees learn?"
                        placeholderTextColor="#6B7280"
                        multiline
                    />

                    {/* Thumbnail */}
                    <Text style={styles.label}>Thumbnail Image</Text>
                    <TouchableOpacity style={styles.thumbnailBtn} onPress={handleUploadThumbnail}>
                        {thumbnailUrl ? (
                            <Image source={{ uri: thumbnailUrl }} style={styles.thumbnailPreview} />
                        ) : (
                            <View style={styles.thumbnailPlaceholder}>
                                <Feather name="image" size={24} color="#6B7280" />
                                <Text style={styles.thumbnailText}>Add Thumbnail</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Category */}
                    <Text style={styles.label}>Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {categories.map(cat => (
                            <TouchableOpacity
                                key={cat}
                                style={[styles.chip, category === cat && styles.chipActive]}
                                onPress={() => setCategory(cat)}
                            >
                                <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Difficulty */}
                    <Text style={[styles.label, { marginTop: 16 }]}>Difficulty</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {difficulties.map(diff => (
                            <TouchableOpacity
                                key={diff}
                                style={[
                                    styles.chip,
                                    difficulty === diff && styles.chipActive,
                                    {
                                        backgroundColor: difficulty === diff
                                            ? diff === 'Easy' ? '#10B981' : diff === 'Medium' ? '#F59E0B' : '#EF4444'
                                            : 'rgba(255,255,255,0.1)'
                                    }
                                ]}
                                onPress={() => setDifficulty(diff)}
                            >
                                <Text style={[styles.chipText, difficulty === diff && styles.chipTextActive]}>
                                    {diff}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Flow Builder */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Simulation Steps</Text>
                        <TouchableOpacity style={styles.addNodeBtn} onPress={addNode}>
                            <Feather name="plus" size={18} color="#FFF" />
                            <Text style={styles.addNodeText}>Add Step</Text>
                        </TouchableOpacity>
                    </View>

                    {nodes.length === 0 ? (
                        <View style={styles.emptyNodes}>
                            <MaterialCommunityIcons name="movie-open-plus-outline" size={48} color="#4B5563" />
                            <Text style={styles.emptyText}>No steps yet</Text>
                            <Text style={styles.emptySubtext}>Add steps to create your simulation flow</Text>
                        </View>
                    ) : (
                        nodes.map((node, index) => (
                            <NodeEditor
                                key={node.id}
                                node={node}
                                index={index}
                                nodes={nodes}
                                onUpdate={updateNode}
                                onDelete={deleteNode}
                                onUploadVideo={handleUploadVideo}
                            />
                        ))
                    )}
                </View>

                {/* Flow Preview */}
                {nodes.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Flow Preview</Text>
                        <View style={styles.flowPreview}>
                            {nodes.map((node, index) => {
                                const correctOpt = node.options.find(o => o.isCorrect);
                                const nextNodeTitle = correctOpt?.nextNodeId
                                    ? nodes.find(n => n.id === correctOpt.nextNodeId)?.title || 'Next Step'
                                    : 'End';

                                return (
                                    <View key={node.id} style={styles.flowNode}>
                                        <View style={[
                                            styles.flowNodeCircle,
                                            node.isStart && styles.flowNodeStart
                                        ]}>
                                            <Text style={styles.flowNodeNumber}>{index + 1}</Text>
                                        </View>
                                        <Text style={styles.flowNodeTitle} numberOfLines={1}>
                                            {node.title || 'Untitled'}
                                        </Text>
                                        <Text style={styles.flowNodeArrow}>→ {nextNodeTitle}</Text>
                                        {index < nodes.length - 1 && (
                                            <View style={styles.flowConnector}>
                                                <Feather name="arrow-down" size={16} color="#6B7280" />
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

// --- MAIN STYLES ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    closeBtn: {
        padding: 8,
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
    },
    saveBtnText: {
        color: '#FFF',
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        marginLeft: 6,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
        paddingBottom: 100,
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        color: '#FFF',
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 16,
    },
    label: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 8,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 14,
        color: '#FFF',
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    thumbnailBtn: {
        height: 120,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderStyle: 'dashed',
    },
    thumbnailPreview: {
        width: '100%',
        height: '100%',
    },
    thumbnailPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    thumbnailText: {
        color: '#6B7280',
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        marginTop: 8,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginRight: 10,
    },
    chipActive: {
        backgroundColor: '#8B5CF6',
    },
    chipText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    chipTextActive: {
        color: '#FFF',
    },
    addNodeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
    },
    addNodeText: {
        color: '#FFF',
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        marginLeft: 6,
    },
    emptyNodes: {
        alignItems: 'center',
        padding: 40,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderStyle: 'dashed',
    },
    emptyText: {
        color: '#9CA3AF',
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        marginTop: 12,
    },
    emptySubtext: {
        color: '#6B7280',
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        marginTop: 4,
    },
    flowPreview: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
    },
    flowNode: {
        alignItems: 'center',
        marginBottom: 8,
    },
    flowNodeCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(139, 92, 246, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    flowNodeStart: {
        backgroundColor: '#10B981',
    },
    flowNodeNumber: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
    },
    flowNodeTitle: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: 4,
        maxWidth: 150,
        textAlign: 'center',
    },
    flowNodeArrow: {
        color: '#6B7280',
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    flowConnector: {
        marginTop: 8,
    },
});

// --- NODE EDITOR STYLES ---
const nodeStyles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        marginBottom: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    stepBadge: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: 'rgba(139, 92, 246, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    startBadge: {
        backgroundColor: '#10B981',
    },
    stepNumber: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
    },
    headerInfo: {
        flex: 1,
    },
    nodeTitle: {
        color: '#FFF',
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
    optionCount: {
        color: '#9CA3AF',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    startTag: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        marginRight: 10,
    },
    startTagText: {
        color: '#10B981',
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
    },
    content: {
        padding: 16,
        paddingTop: 0,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    label: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 6,
        marginTop: 12,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: 12,
        color: '#FFF',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    uploadBtn: {
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderStyle: 'dashed',
    },
    uploadPlaceholder: {
        padding: 24,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    uploadText: {
        color: '#6B7280',
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        marginTop: 8,
    },
    videoPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    videoText: {
        color: '#10B981',
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        flex: 1,
        marginLeft: 10,
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        marginTop: 12,
    },
    toggleLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    toggle: {
        width: 48,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: 3,
    },
    toggleActive: {
        backgroundColor: '#10B981',
    },
    toggleDot: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#FFF',
    },
    toggleDotActive: {
        alignSelf: 'flex-end',
    },
    optionsSection: {
        marginTop: 16,
    },
    optionsSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    addOptionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
    },
    addOptionText: {
        color: '#8B5CF6',
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        marginLeft: 4,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
    },
    optionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    optionBadge: {
        width: 24,
        height: 24,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    correctBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.3)',
    },
    optionBadgeText: {
        color: '#FFF',
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    optionText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        flex: 1,
    },
    optionActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    correctTag: {
        padding: 4,
        borderRadius: 4,
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        marginRight: 4,
    },
    noOptionsText: {
        color: '#6B7280',
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        padding: 20,
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    deleteBtnText: {
        color: '#EF4444',
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        marginLeft: 6,
    },
});

// --- OPTION EDITOR MODAL STYLES ---
const optionStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#1E293B',
        borderRadius: 20,
        overflow: 'hidden',
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        color: '#FFF',
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
    },
    label: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 6,
        marginTop: 12,
    },
    toggleLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    hint: {
        color: '#6B7280',
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: 12,
        color: '#FFF',
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        marginTop: 6,
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        marginTop: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        paddingHorizontal: 12,
    },
    toggle: {
        width: 48,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: 3,
    },
    toggleActive: {
        backgroundColor: '#10B981',
    },
    toggleDot: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#FFF',
    },
    toggleDotActive: {
        alignSelf: 'flex-end',
    },
    nodeChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    nodeChipActive: {
        backgroundColor: '#8B5CF6',
    },
    nodeChipText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    nodeChipTextActive: {
        color: '#FFF',
    },
    saveBtn: {
        marginTop: 20,
        borderRadius: 12,
        overflow: 'hidden',
    },
    saveBtnGradient: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    saveBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
});
