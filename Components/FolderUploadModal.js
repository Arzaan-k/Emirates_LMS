import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import API_URL from '../config';

const FolderUploadModal = ({ visible, onClose, onUploadComplete }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [rootFolderName, setRootFolderName] = useState('');
  const [learningPathType, setLearningPathType] = useState('career_progression');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef(null);

  // Impact Existing Users Progress - default setting for all files
  const [defaultImpactSetting, setDefaultImpactSetting] = useState(true);

  // Affected Users Preview & Selection
  const [affectedUsers, setAffectedUsers] = useState(null);
  const [loadingAffectedUsers, setLoadingAffectedUsers] = useState(false);
  const [showAffectedUsersModal, setShowAffectedUsersModal] = useState(false);
  const [selectedImpactedUsers, setSelectedImpactedUsers] = useState(new Set()); // Emails of users selected to be impacted

  // Duplicate Modal State
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [duplicateFiles, setDuplicateFiles] = useState([]);
  const [duplicateAction, setDuplicateAction] = useState('skip'); // 'skip' or 'replace'

  // Fetch affected users when learning path type changes
  useEffect(() => {
    if (visible && learningPathType) {
      fetchAffectedUsers();
    }
  }, [visible, learningPathType]);

  const fetchAffectedUsers = async () => {
    setLoadingAffectedUsers(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(
        `${API_URL}/api/v1/self-learning/admin/learning-path/${learningPathType}/affected-users`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setAffectedUsers(data);
        if (data && defaultImpactSetting) {
          let allUsers = [];
          if (data.completed_users) allUsers = [...allUsers, ...data.completed_users.map(u => u.email)];
          if (data.in_progress_users) allUsers = [...allUsers, ...data.in_progress_users.map(u => u.email)];
          setSelectedImpactedUsers(new Set(allUsers));
        }
      }
    } catch (error) {
      console.error('Error fetching affected users:', error);
    } finally {
      setLoadingAffectedUsers(false);
    }
  };

  // Toggle individual user selection for impact
  const toggleUserImpact = (email) => {
    setSelectedImpactedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(email)) {
        newSet.delete(email);
      } else {
        newSet.add(email);
      }
      return newSet;
    });
  };

  // Select all completed users for impact
  const selectAllCompletedUsers = () => {
    let allUsers = [];
    if (affectedUsers?.completed_users) allUsers = [...allUsers, ...affectedUsers.completed_users.map(u => u.email)];
    if (affectedUsers?.in_progress_users) allUsers = [...allUsers, ...affectedUsers.in_progress_users.map(u => u.email)];
    setSelectedImpactedUsers(new Set(allUsers));
  };

  // Deselect all users (no one will be impacted)
  const deselectAllUsers = () => {
    setSelectedImpactedUsers(new Set());
  };

  // Build tree structure from files
  const buildFileTree = (files) => {
    const tree = {};

    files.forEach(entry => {
      const file = entry.file;
      const parts = entry.path ? entry.path.split('/') : (file.webkitRelativePath ? file.webkitRelativePath.split('/') : [file.name]);
      let current = tree;

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // It's a file
          if (!current._files) current._files = [];
          current._files.push({
            name: part,
            file: file,
            path: entry.path || file.webkitRelativePath || file.name,
            selected: entry.selected !== false,
            type: entry.type || getFileType(part),
            impactsExisting: entry.impactsExisting !== undefined ? entry.impactsExisting : defaultImpactSetting
          });
        } else {
          // It's a folder
          if (!current[part]) {
            current[part] = { _name: part, _expanded: true };
          }
          current = current[part];
        }
      });
    });

    return tree;
  };

  const cloneTreePreserveFiles = (node) => {
    if (node == null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(cloneTreePreserveFiles);

    const out = {};
    Object.keys(node).forEach(k => {
      if (k === 'file') {
        out[k] = node[k];
        return;
      }
      out[k] = cloneTreePreserveFiles(node[k]);
    });
    return out;
  };

  const getFileType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
      mp4: 'Video', webm: 'Video', mov: 'Video', avi: 'Video',
      mp3: 'Audio', wav: 'Audio',
      pdf: 'PDF',
      doc: 'Document', docx: 'Document',
      ppt: 'Presentation', pptx: 'Presentation',
      jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image',
      xls: 'Spreadsheet', xlsx: 'Spreadsheet',
    };
    return types[ext] || 'Other';
  };

  const getFileIcon = (type) => {
    const icons = {
      Video: 'movie',
      Audio: 'audiotrack',
      PDF: 'picture-as-pdf',
      Document: 'description',
      Presentation: 'slideshow',
      Image: 'image',
      Spreadsheet: 'table-chart',
      Other: 'insert-drive-file'
    };
    return icons[type] || 'insert-drive-file';
  };

  const handleFolderSelect = (event) => {
    if (Platform.OS === 'web') {
      const files = Array.from(event.target.files);

      if (files.length === 0) return;

      // Get root folder name from first file's path
      const firstPath = files[0].webkitRelativePath || files[0].name;
      const rootName = firstPath.split('/')[0];

      setRootFolderName(rootName);
      const wrapped = files.map(f => ({
        file: f,
        name: f.name,
        path: f.webkitRelativePath || f.name,
        selected: true,
        type: getFileType(f.name),
        impactsExisting: defaultImpactSetting,
      }));
      setSelectedFiles(wrapped);
      setFileTree(buildFileTree(wrapped));
      setUploadProgress(0);
      setUploadStatus('');
    }
  };

  const toggleFileSelection = (filePath) => {
    setSelectedFiles(prevFiles =>
      prevFiles.map(f => {
        if (f.path === filePath) {
          return { ...f, selected: !(f.selected !== false) };
        }
        return f;
      })
    );

    // Update tree
    setFileTree(prevTree => {
      const newTree = cloneTreePreserveFiles(prevTree);
      updateFileSelectionInTree(newTree, filePath);
      return newTree;
    });
  };

  const updateFileSelectionInTree = (tree, filePath) => {
    Object.keys(tree).forEach(key => {
      if (key === '_files') {
        tree._files = tree._files.map(f => {
          if (f.path === filePath) {
            return { ...f, selected: !(f.selected !== false) };
          }
          return f;
        });
      } else if (typeof tree[key] === 'object') {
        updateFileSelectionInTree(tree[key], filePath);
      }
    });
  };

  const toggleFileImpact = (filePath) => {
    setSelectedFiles(prevFiles =>
      prevFiles.map(f => {
        if (f.path === filePath) {
          return { ...f, impactsExisting: !f.impactsExisting };
        }
        return f;
      })
    );

    setFileTree(prevTree => {
      const newTree = cloneTreePreserveFiles(prevTree);
      updateFileImpactInTree(newTree, filePath);
      return newTree;
    });
  };

  const updateFileImpactInTree = (tree, filePath) => {
    Object.keys(tree).forEach(key => {
      if (key === '_files') {
        tree._files = tree._files.map(f => {
          if (f.path === filePath) {
            return { ...f, impactsExisting: !f.impactsExisting };
          }
          return f;
        });
      } else if (typeof tree[key] === 'object') {
        updateFileImpactInTree(tree[key], filePath);
      }
    });
  };

  const applyDefaultImpactToAll = (impactValue) => {
    setDefaultImpactSetting(impactValue);
    setSelectedFiles(prevFiles =>
      prevFiles.map(f => ({ ...f, impactsExisting: impactValue }))
    );
    if (fileTree) {
      setFileTree(prevTree => {
        const newTree = cloneTreePreserveFiles(prevTree);
        setAllImpactsInTree(newTree, impactValue);
        return newTree;
      });
    }
  };

  const setAllImpactsInTree = (tree, impactValue) => {
    Object.keys(tree).forEach(key => {
      if (key === '_files') {
        tree._files = tree._files.map(f => ({ ...f, impactsExisting: impactValue }));
      } else if (typeof tree[key] === 'object') {
        setAllImpactsInTree(tree[key], impactValue);
      }
    });
  };

  const toggleFolderExpansion = (folderPath) => {
    setFileTree(prevTree => {
      const newTree = cloneTreePreserveFiles(prevTree);
      toggleFolderInTree(newTree, folderPath.split('/'));
      return newTree;
    });
  };

  const toggleFolderInTree = (tree, pathParts) => {
    if (pathParts.length === 0) return;

    const current = pathParts[0];
    if (pathParts.length === 1) {
      if (tree[current]) {
        tree[current]._expanded = !tree[current]._expanded;
      }
    } else {
      if (tree[current]) {
        toggleFolderInTree(tree[current], pathParts.slice(1));
      }
    }
  };

  const renderFileTree = (tree, path = '', level = 0) => {
    if (!tree) return null;

    return Object.keys(tree).map(key => {
      if (key.startsWith('_')) return null;

      const item = tree[key];
      const currentPath = path ? `${path}/${key}` : key;
      const isFolder = typeof item === 'object' && !item.file;

      if (isFolder) {
        const isExpanded = item._expanded !== false;
        const files = item._files || [];

        return (
          <View key={currentPath} style={{ marginLeft: level * 20 }}>
            <TouchableOpacity
              style={styles.treeItem}
              onPress={() => toggleFolderExpansion(currentPath)}
            >
              <MaterialIcons
                name={isExpanded ? 'folder-open' : 'folder'}
                size={20}
                color="#3B82F6"
              />
              <Text style={styles.treeItemText}>{item._name || key}</Text>
              <MaterialIcons
                name={isExpanded ? 'expand-more' : 'chevron-right'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>

            {isExpanded && renderFileTree(item, currentPath, level + 1)}
          </View>
        );
      }

      return null;
    }).filter(Boolean).concat(
      tree._files?.map(file => (
        <View key={file.path} style={[styles.treeFileRow, { marginLeft: level * 20 }]}>
          <TouchableOpacity
            style={styles.treeItem}
            onPress={() => toggleFileSelection(file.path)}
          >
            <MaterialIcons
              name={file.selected ? 'check-box' : 'check-box-outline-blank'}
              size={20}
              color={file.selected ? '#10B981' : '#999'}
            />
            <MaterialIcons
              name={getFileIcon(file.type)}
              size={18}
              color="#666"
              style={{ marginLeft: 5 }}
            />
            <Text style={[styles.fileItemText, !file.selected && styles.fileDeselected]}>
              {file.name}
            </Text>
            <Text style={styles.fileType}>{file.type}</Text>
          </TouchableOpacity>
          {/* Impact Toggle for each file */}
          {file.selected && (
            <TouchableOpacity
              style={[
                styles.impactToggle,
                file.impactsExisting ? styles.impactToggleOn : styles.impactToggleOff
              ]}
              onPress={() => toggleFileImpact(file.path)}
            >
              <MaterialIcons
                name={file.impactsExisting ? 'group' : 'group-off'}
                size={14}
                color={file.impactsExisting ? '#FFF' : '#6B7280'}
              />
              <Text style={[
                styles.impactToggleText,
                file.impactsExisting ? styles.impactToggleTextOn : styles.impactToggleTextOff
              ]}>
                {file.impactsExisting ? 'Impact' : 'No Impact'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )) || []
    );
  };

  const getSelectedFiles = () => {
    const selected = [];

    const traverse = (tree) => {
      if (tree._files) {
        tree._files.forEach(f => {
          if (f.selected !== false) {
            selected.push(f);
          }
        });
      }

      Object.keys(tree).forEach(key => {
        if (!key.startsWith('_') && typeof tree[key] === 'object') {
          traverse(tree[key]);
        }
      });
    };

    if (fileTree) {
      traverse(fileTree);
    }

    return selected;
  };

  const checkForDuplicates = async (filesToUpload) => {
    try {
      const formData = new FormData();

      // Only send paths, NOT file data (saves memory on server)
      const filePaths = filesToUpload.map(f => f.path);
      formData.append('file_paths', JSON.stringify(filePaths));
      formData.append('root_bucket_name', rootFolderName);
      formData.append('learning_path_type', learningPathType);

      const response = await fetch(`${API_URL}/api/v1/content/bulk-folder-upload/check-duplicates`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        return result.duplicates || [];
      }
      return [];
    } catch (error) {
      console.error('Duplicate check error:', error);
      return [];
    }
  };

  const performUpload = async (skipDuplicates = false, dupAction = 'skip') => {
    const filesToUpload = getSelectedFiles();
    const total = filesToUpload.length;

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus(`Preparing to upload ${total} files (one at a time)...`);

    let successful = 0;
    let skipped = 0;
    let failed = 0;
    const failedItems = [];

    try {
      for (let i = 0; i < total; i++) {
        const fileObj = filesToUpload[i];
        const pct = Math.round(((i) / total) * 100);
        setUploadProgress(pct);
        setUploadStatus(`Uploading ${i + 1}/${total}: ${fileObj.name}`);

        try {
          const formData = new FormData();
          formData.append('file', fileObj.file);
          formData.append('file_path', fileObj.path);
          formData.append('root_bucket_name', rootFolderName);
          formData.append('learning_path_type', learningPathType);
          formData.append('skip_duplicates', skipDuplicates ? 'true' : 'false');
          formData.append('duplicate_action', dupAction);
          formData.append('impacts_existing_progress', fileObj.impactsExisting !== false ? 'true' : 'false');
          // Send selected users who will be impacted by this course
          formData.append('impacted_users', JSON.stringify(Array.from(selectedImpactedUsers)));

          const response = await fetch(`${API_URL}/api/v1/content/bulk-folder-upload/single`, {
            method: 'POST',
            body: formData,
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.detail || `Server error ${response.status}`);
          }

          if (result.status === 'skipped') {
            skipped++;
          } else {
            successful++;
          }
        } catch (fileError) {
          console.error(`Failed to upload ${fileObj.name}:`, fileError);
          failed++;
          failedItems.push(fileObj.name);
        }
      }

      setUploadProgress(100);
      const parts = [];
      if (successful > 0) parts.push(`${successful} uploaded`);
      if (skipped > 0) parts.push(`${skipped} skipped`);
      if (failed > 0) parts.push(`${failed} failed`);

      const statusIcon = failed === total ? '❌' : '✅';
      setUploadStatus(`${statusIcon} Upload complete! ${parts.join(', ')}`);

      setTimeout(() => {
        onUploadComplete && onUploadComplete({
          status: 'completed',
          results: { total, successful, skipped, failed, items: [] },
        });
        handleClose();
      }, 2000);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress(0);
      setUploadStatus(`❌ Upload failed: ${error.message}`);

      setTimeout(() => {
        setUploading(false);
        setUploadStatus('');
      }, 3000);
    }
  };

  const handleUpload = async () => {
    const filesToUpload = getSelectedFiles();

    if (filesToUpload.length === 0) {
      alert('Please select at least one file to upload');
      return;
    }

    // Check for duplicates first
    setUploadStatus('Checking for existing files...');
    setUploading(true);

    const duplicates = await checkForDuplicates(filesToUpload);

    if (duplicates.length > 0) {
      setUploading(false);
      setDuplicateFiles(duplicates);
      setDuplicateAction('skip'); // Default to skip
      setDuplicateModalVisible(true);
    } else {
      // No duplicates, proceed with upload
      await performUpload(false, 'skip');
    }
  };

  const handleDuplicateConfirm = async () => {
    setDuplicateModalVisible(false);
    await performUpload(true, duplicateAction);
  };

  const handleDuplicateCancel = () => {
    setDuplicateModalVisible(false);
    setDuplicateFiles([]);
  };

  const handleClose = () => {
    setSelectedFiles([]);
    setFileTree(null);
    setRootFolderName('');
    setUploading(false);
    setUploadProgress(0);
    setUploadStatus('');
    setDefaultImpactSetting(true);  // Reset to default
    setAffectedUsers(null);
    setShowAffectedUsersModal(false);
    setSelectedImpactedUsers(new Set());  // Reset selected users
    onClose();
  };

  const selectedCount = getSelectedFiles().length;

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Bulk Folder Upload</Text>
            <TouchableOpacity onPress={handleClose}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Learning Path Selection */}
          <View style={styles.pathSelector}>
            <Text style={styles.label}>Learning Path Type:</Text>
            <View style={styles.pathButtons}>
              <TouchableOpacity
                style={[
                  styles.pathButton,
                  learningPathType === 'career_progression' && styles.pathButtonActive
                ]}
                onPress={() => setLearningPathType('career_progression')}
              >
                <Text style={[
                  styles.pathButtonText,
                  learningPathType === 'career_progression' && styles.pathButtonTextActive
                ]}>
                  Career Progression
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.pathButton,
                  learningPathType === 'self_learning' && styles.pathButtonActive
                ]}
                onPress={() => setLearningPathType('self_learning')}
              >
                <Text style={[
                  styles.pathButtonText,
                  learningPathType === 'self_learning' && styles.pathButtonTextActive
                ]}>
                  Self Learning
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Folder Selection */}
          {Platform.OS === 'web' && !fileTree && (
            <View style={styles.selectSection}>
              <input
                ref={fileInputRef}
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderSelect}
                style={{ display: 'none' }}
              />
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => fileInputRef.current?.click()}
              >
                <MaterialIcons name="folder-open" size={24} color="#FFF" />
                <Text style={styles.selectButtonText}>Select Folder</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>
                Choose a folder to upload. All files and subfolders will be preserved.
              </Text>
            </View>
          )}

          {/* File Tree Preview */}
          {fileTree && !uploading && (
            <>
              <View style={styles.treeHeader}>
                <Text style={styles.treeTitle}>
                  {rootFolderName} ({selectedCount} files selected)
                </Text>
              </View>

              <ScrollView style={styles.treeContainer}>
                {/* Impact Existing Users Setting */}
                <View style={styles.impactSettingContainer}>
                  <View style={styles.impactSettingHeader}>
                    <MaterialIcons name="info-outline" size={18} color="#3B82F6" />
                    <Text style={styles.impactSettingTitle}>Impact Existing Users' Progress</Text>
                  </View>
                  <Text style={styles.impactSettingDesc}>
                    Choose whether new courses affect existing users who have already completed this folder.
                  </Text>
                  <View style={styles.impactButtons}>
                    <TouchableOpacity
                      style={[
                        styles.impactButton,
                        defaultImpactSetting && styles.impactButtonActive
                      ]}
                      onPress={() => {
                        applyDefaultImpactToAll(true);
                        let allUsers = [];
                        if (affectedUsers?.completed_users) allUsers = [...allUsers, ...affectedUsers.completed_users.map(u => u.email)];
                        if (affectedUsers?.in_progress_users) allUsers = [...allUsers, ...affectedUsers.in_progress_users.map(u => u.email)];
                        setSelectedImpactedUsers(new Set(allUsers));
                      }}
                    >
                      <MaterialIcons name="group" size={18} color={defaultImpactSetting ? '#FFF' : '#6B7280'} />
                      <View style={styles.impactButtonTextContainer}>
                        <Text style={[styles.impactButtonTitle, defaultImpactSetting && styles.impactButtonTitleActive]}>
                          Impact All
                        </Text>
                        <Text style={[styles.impactButtonSubtitle, defaultImpactSetting && styles.impactButtonSubtitleActive]}>
                          Users must complete new courses
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.impactButton,
                        !defaultImpactSetting && styles.impactButtonActiveGreen
                      ]}
                      onPress={() => {
                        applyDefaultImpactToAll(false);
                        setSelectedImpactedUsers(new Set());
                      }}
                    >
                      <MaterialIcons name="group-off" size={18} color={!defaultImpactSetting ? '#FFF' : '#6B7280'} />
                      <View style={styles.impactButtonTextContainer}>
                        <Text style={[styles.impactButtonTitle, !defaultImpactSetting && styles.impactButtonTitleActive]}>
                          No Impact
                        </Text>
                        <Text style={[styles.impactButtonSubtitle, !defaultImpactSetting && styles.impactButtonSubtitleActive]}>
                          Users who completed stay at 100%
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.impactHint}>
                    Tip: Click individual file badges to customize per-file settings
                  </Text>

                  {/* Affected Users Preview */}
                  {loadingAffectedUsers ? (
                    <View style={styles.affectedUsersLoading}>
                      <ActivityIndicator size="small" color="#3B82F6" />
                      <Text style={styles.affectedUsersLoadingText}>Loading user data...</Text>
                    </View>
                  ) : affectedUsers && (
                    <View style={styles.affectedUsersPreview}>
                      <View style={styles.affectedUsersSummary}>
                        {/* Users who will be affected */}
                        <View style={styles.affectedUserBox}>
                          <View style={[styles.affectedUserIcon, { backgroundColor: defaultImpactSetting ? '#FEE2E2' : '#D1FAE5' }]}>
                            <MaterialIcons
                              name={defaultImpactSetting ? 'warning' : 'check-circle'}
                              size={20}
                              color={defaultImpactSetting ? '#DC2626' : '#10B981'}
                            />
                          </View>
                          <View style={styles.affectedUserInfo}>
                            <Text style={styles.affectedUserCount}>
                              {defaultImpactSetting ? selectedImpactedUsers.size : 0}
                            </Text>
                            <Text style={styles.affectedUserLabel}>
                              {defaultImpactSetting ? 'Selected to impact' : 'Won\'t be affected'}
                            </Text>
                            <Text style={styles.affectedUserDesc}>
                              of {affectedUsers.summary?.completed_count || 0} users at 100%
                            </Text>
                          </View>
                        </View>

                        {/* Users in progress */}
                        <View style={styles.affectedUserBox}>
                          <View style={[styles.affectedUserIcon, { backgroundColor: '#FEF3C7' }]}>
                            <MaterialIcons name="schedule" size={20} color="#D97706" />
                          </View>
                          <View style={styles.affectedUserInfo}>
                            <Text style={styles.affectedUserCount}>
                              {affectedUsers.summary?.in_progress_count || 0}
                            </Text>
                            <Text style={styles.affectedUserLabel}>Always affected</Text>
                            <Text style={styles.affectedUserDesc}>
                              Users in progress
                            </Text>
                          </View>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.viewAllUsersBtn}
                        onPress={() => setShowAffectedUsersModal(true)}
                      >
                        <MaterialIcons name="edit" size={16} color="#3B82F6" />
                        <Text style={styles.viewAllUsersBtnText}>
                          {defaultImpactSetting ? 'Select Users to Impact' : 'View Users'} ({affectedUsers.summary?.total_users || 0})
                        </Text>
                        <MaterialIcons name="chevron-right" size={18} color="#3B82F6" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {renderFileTree(fileTree)}
              </ScrollView>

              {/* Action Buttons */}
              <View style={styles.footer}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={handleUpload}
                  disabled={selectedCount === 0}
                >
                  <MaterialIcons name="cloud-upload" size={20} color="#FFF" />
                  <Text style={styles.uploadButtonText}>
                    Upload {selectedCount} Files
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Upload Progress */}
          {uploading && (
            <View style={styles.progressContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.progressText}>{uploadStatus}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.progressPercentage}>{uploadProgress}%</Text>
            </View>
          )}
        </View>
      </View>

      {/* Duplicate Files Modal */}
      <Modal visible={duplicateModalVisible} animationType="fade" transparent={true}>
        <View style={styles.duplicateModalOverlay}>
          <View style={styles.duplicateModalContent}>
            {/* Header */}
            <View style={styles.duplicateHeader}>
              <MaterialIcons name="warning" size={32} color="#F59E0B" />
              <Text style={styles.duplicateTitle}>Duplicate Files Found</Text>
            </View>

            {/* Message */}
            <Text style={styles.duplicateMessage}>
              Found {duplicateFiles.length} file{duplicateFiles.length > 1 ? 's' : ''} that already exist in the same location:
            </Text>

            {/* Duplicate Files List */}
            <ScrollView style={styles.duplicateList}>
              {duplicateFiles.map((dup, index) => (
                <View key={index} style={styles.duplicateItem}>
                  <MaterialIcons
                    name={getFileIcon(getFileType(dup.filename))}
                    size={20}
                    color="#6B7280"
                  />
                  <View style={styles.duplicateInfo}>
                    <Text style={styles.duplicateFileName} numberOfLines={1}>
                      {dup.title}
                    </Text>
                    <Text style={styles.duplicatePath} numberOfLines={1}>
                      {dup.folder_path}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Action Selection */}
            <View style={styles.duplicateActions}>
              <Text style={styles.duplicateActionLabel}>What would you like to do?</Text>

              <TouchableOpacity
                style={[
                  styles.duplicateActionBtn,
                  duplicateAction === 'skip' && styles.duplicateActionBtnActive
                ]}
                onPress={() => setDuplicateAction('skip')}
              >
                <View style={styles.duplicateActionContent}>
                  <MaterialIcons
                    name="skip-next"
                    size={24}
                    color={duplicateAction === 'skip' ? '#3B82F6' : '#6B7280'}
                  />
                  <View style={styles.duplicateActionText}>
                    <Text style={[
                      styles.duplicateActionTitle,
                      duplicateAction === 'skip' && styles.duplicateActionTitleActive
                    ]}>
                      Skip Duplicates
                    </Text>
                    <Text style={styles.duplicateActionDesc}>
                      Keep existing files, only upload new ones
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.duplicateActionBtn,
                  duplicateAction === 'replace' && styles.duplicateActionBtnActive
                ]}
                onPress={() => setDuplicateAction('replace')}
              >
                <View style={styles.duplicateActionContent}>
                  <MaterialIcons
                    name="sync"
                    size={24}
                    color={duplicateAction === 'replace' ? '#3B82F6' : '#6B7280'}
                  />
                  <View style={styles.duplicateActionText}>
                    <Text style={[
                      styles.duplicateActionTitle,
                      duplicateAction === 'replace' && styles.duplicateActionTitleActive
                    ]}>
                      Replace Existing
                    </Text>
                    <Text style={styles.duplicateActionDesc}>
                      Overwrite existing files with new versions
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            {/* Footer Buttons */}
            <View style={styles.duplicateFooter}>
              <TouchableOpacity
                style={styles.duplicateCancelBtn}
                onPress={handleDuplicateCancel}
              >
                <Text style={styles.duplicateCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.duplicateConfirmBtn}
                onPress={handleDuplicateConfirm}
              >
                <Text style={styles.duplicateConfirmText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Affected Users Modal */}
      <Modal visible={showAffectedUsersModal} animationType="slide" transparent={true}>
        <View style={styles.affectedUsersModalOverlay}>
          <View style={styles.affectedUsersModalContent}>
            {/* Header */}
            <View style={styles.affectedUsersModalHeader}>
              <View style={styles.affectedUsersModalTitleRow}>
                <MaterialIcons name="people" size={24} color="#3B82F6" />
                <Text style={styles.affectedUsersModalTitle}>Select Users to Impact</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAffectedUsersModal(false)}>
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Impact Mode Indicator */}
            <View style={[
              styles.impactModeIndicator,
              defaultImpactSetting ? styles.impactModeOn : styles.impactModeOff
            ]}>
              <MaterialIcons
                name={defaultImpactSetting ? 'warning' : 'check-circle'}
                size={18}
                color={defaultImpactSetting ? '#DC2626' : '#10B981'}
              />
              <Text style={[
                styles.impactModeText,
                defaultImpactSetting ? styles.impactModeTextOn : styles.impactModeTextOff
              ]}>
                {defaultImpactSetting
                  ? `Impact Mode: ${selectedImpactedUsers.size} users selected to be impacted`
                  : 'No Impact Mode: No users will be affected'}
              </Text>
            </View>

            {/* Select All / None Buttons - Only show in Impact Mode */}
            {defaultImpactSetting && affectedUsers?.completed_users?.length > 0 && (
              <View style={styles.selectAllContainer}>
                <TouchableOpacity style={styles.selectAllBtn} onPress={selectAllCompletedUsers}>
                  <MaterialIcons name="select-all" size={16} color="#3B82F6" />
                  <Text style={styles.selectAllBtnText}>Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.selectNoneBtn} onPress={deselectAllUsers}>
                  <MaterialIcons name="deselect" size={16} color="#6B7280" />
                  <Text style={styles.selectNoneBtnText}>Select None</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView style={styles.affectedUsersScrollView}>
              {/* Completed Users Section */}
              {affectedUsers?.completed_users?.length > 0 && (
                <View style={styles.affectedUsersSection}>
                  <View style={styles.affectedUsersSectionHeader}>
                    <View style={[styles.sectionIconBadge, { backgroundColor: defaultImpactSetting ? '#FEE2E2' : '#D1FAE5' }]}>
                      <MaterialIcons
                        name={defaultImpactSetting ? 'warning' : 'check-circle'}
                        size={16}
                        color={defaultImpactSetting ? '#DC2626' : '#10B981'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.affectedUsersSectionTitle}>
                        Users at 100% ({affectedUsers.completed_users.length})
                      </Text>
                      <Text style={styles.affectedUsersSectionSubtitle}>
                        {defaultImpactSetting
                          ? 'Select users who must complete new courses'
                          : 'These users will NOT be affected'}
                      </Text>
                    </View>
                  </View>
                  {affectedUsers.completed_users.slice(0, 50).map((user, index) => (
                    <TouchableOpacity
                      key={user.email || index}
                      style={styles.affectedUserItem}
                      onPress={() => defaultImpactSetting && toggleUserImpact(user.email)}
                      disabled={!defaultImpactSetting}
                    >
                      {/* Checkbox - Only show in Impact Mode */}
                      {defaultImpactSetting && (
                        <MaterialIcons
                          name={selectedImpactedUsers.has(user.email) ? 'check-box' : 'check-box-outline-blank'}
                          size={22}
                          color={selectedImpactedUsers.has(user.email) ? '#3B82F6' : '#9CA3AF'}
                        />
                      )}
                      <View style={styles.affectedUserAvatar}>
                        <Text style={styles.affectedUserAvatarText}>
                          {(user.name || user.email || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.affectedUserDetails}>
                        <Text style={styles.affectedUserName}>{user.name || user.email}</Text>
                        <Text style={styles.affectedUserMeta}>
                          {user.role || 'No Role'} • {user.store || 'No Store'}
                        </Text>
                      </View>
                      <View style={[
                        styles.affectedUserBadge,
                        { backgroundColor: (defaultImpactSetting && selectedImpactedUsers.has(user.email)) ? '#FEE2E2' : '#D1FAE5' }
                      ]}>
                        <Text style={[
                          styles.affectedUserBadgeText,
                          { color: (defaultImpactSetting && selectedImpactedUsers.has(user.email)) ? '#DC2626' : '#10B981' }
                        ]}>
                          {(defaultImpactSetting && selectedImpactedUsers.has(user.email)) ? 'Impacted' : 'Safe'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {affectedUsers.completed_users.length > 50 && (
                    <Text style={styles.affectedUsersMore}>
                      +{affectedUsers.completed_users.length - 50} more users
                    </Text>
                  )}
                </View>
              )}

              {/* In Progress Users Section */}
              {affectedUsers?.in_progress_users?.length > 0 && (
                <View style={styles.affectedUsersSection}>
                  <View style={styles.affectedUsersSectionHeader}>
                    <View style={[styles.sectionIconBadge, { backgroundColor: '#FEF3C7' }]}>
                      <MaterialIcons name="schedule" size={16} color="#D97706" />
                    </View>
                    <View>
                      <Text style={styles.affectedUsersSectionTitle}>
                        Users In Progress ({affectedUsers.in_progress_users.length})
                      </Text>
                      <Text style={styles.affectedUsersSectionSubtitle}>
                        These users will always need to complete new courses
                      </Text>
                    </View>
                  </View>
                  {affectedUsers.in_progress_users.slice(0, 20).map((user, index) => (
                    <TouchableOpacity
                      key={user.email || index}
                      style={styles.affectedUserItem}
                      onPress={() => defaultImpactSetting && toggleUserImpact(user.email)}
                      disabled={!defaultImpactSetting}
                    >
                      {defaultImpactSetting && (
                        <MaterialIcons
                          name={selectedImpactedUsers.has(user.email) ? 'check-box' : 'check-box-outline-blank'}
                          size={22}
                          color={selectedImpactedUsers.has(user.email) ? '#3B82F6' : '#9CA3AF'}
                        />
                      )}
                      <View style={styles.affectedUserAvatar}>
                        <Text style={styles.affectedUserAvatarText}>
                          {(user.name || user.email || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.affectedUserDetails}>
                        <Text style={styles.affectedUserName}>{user.name || user.email}</Text>
                        <Text style={styles.affectedUserMeta}>
                          {user.role || 'No Role'} • {user.store || 'No Store'}
                        </Text>
                      </View>
                      <View style={styles.progressBadge}>
                        <Text style={styles.progressBadgeText}>
                          {user.progress_percent || 0}%
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {affectedUsers.in_progress_users.length > 20 && (
                    <Text style={styles.affectedUsersMore}>
                      +{affectedUsers.in_progress_users.length - 20} more users
                    </Text>
                  )}
                </View>
              )}

              {/* Empty State */}
              {(!affectedUsers?.completed_users?.length && !affectedUsers?.in_progress_users?.length) && (
                <View style={styles.emptyAffectedUsers}>
                  <MaterialIcons name="info-outline" size={48} color="#D1D5DB" />
                  <Text style={styles.emptyAffectedUsersText}>
                    No users have started this learning path yet
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.affectedUsersModalFooter}>
              <TouchableOpacity
                style={styles.affectedUsersCloseBtn}
                onPress={() => setShowAffectedUsersModal(false)}
              >
                <Text style={styles.affectedUsersCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 800,
    maxHeight: '90%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
  },
  pathSelector: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  pathButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  pathButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFF',
    alignItems: 'center',
  },
  pathButtonActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  pathButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  pathButtonTextActive: {
    color: '#3B82F6',
  },
  selectSection: {
    alignItems: 'center',
    padding: 40,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 15,
  },
  selectButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  treeHeader: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 10,
  },
  treeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  treeContainer: {
    flex: 1,
    maxHeight: 400,
    marginBottom: 20,
  },
  treeFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  treeItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  treeItemText: {
    flex: 1,
    fontSize: 14,
    color: '#111',
    fontWeight: '500',
  },
  fileItemText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
  fileDeselected: {
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  fileType: {
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  impactToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  impactToggleOn: {
    backgroundColor: '#3B82F6',
  },
  impactToggleOff: {
    backgroundColor: '#E5E7EB',
  },
  impactToggleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  impactToggleTextOn: {
    color: '#FFF',
  },
  impactToggleTextOff: {
    color: '#6B7280',
  },
  impactSettingContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  impactSettingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  impactSettingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E40AF',
  },
  impactSettingDesc: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 18,
  },
  impactButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  impactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  impactButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  impactButtonActiveGreen: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  impactButtonTextContainer: {
    flex: 1,
  },
  impactButtonTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  impactButtonTitleActive: {
    color: '#FFF',
  },
  impactButtonSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  impactButtonSubtitleActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  impactHint: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    alignItems: 'center',
    padding: 40,
  },
  progressText: {
    fontSize: 14,
    color: '#374151',
    marginTop: 20,
    marginBottom: 15,
    textAlign: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
  },
  progressPercentage: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#3B82F6',
  },

  // Duplicate Modal Styles
  duplicateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  duplicateModalContent: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '80%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  duplicateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  duplicateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  duplicateMessage: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 22,
  },
  duplicateList: {
    maxHeight: 350,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  duplicateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#FFF',
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  duplicateInfo: {
    flex: 1,
  },
  duplicateFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  duplicatePath: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  duplicateMore: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  duplicateActions: {
    marginBottom: 20,
  },
  duplicateActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  duplicateActionBtn: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#FFF',
  },
  duplicateActionBtnActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  duplicateActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  duplicateActionText: {
    flex: 1,
  },
  duplicateActionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  duplicateActionTitleActive: {
    color: '#3B82F6',
  },
  duplicateActionDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  duplicateFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  duplicateCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  duplicateCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  duplicateConfirmBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  duplicateConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },

  // Affected Users Preview Styles
  affectedUsersLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  affectedUsersLoadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  affectedUsersPreview: {
    marginTop: 16,
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  affectedUsersSummary: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  affectedUserBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
  },
  affectedUserIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  affectedUserInfo: {
    flex: 1,
  },
  affectedUserCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  affectedUserLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  affectedUserDesc: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  viewAllUsersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  viewAllUsersBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },

  // Affected Users Modal Styles
  affectedUsersModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  affectedUsersModalContent: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '85%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  affectedUsersModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  affectedUsersModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  affectedUsersModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  impactModeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
  },
  impactModeOn: {
    backgroundColor: '#FEF2F2',
  },
  impactModeOff: {
    backgroundColor: '#ECFDF5',
  },
  impactModeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  impactModeTextOn: {
    color: '#991B1B',
  },
  impactModeTextOff: {
    color: '#065F46',
  },
  selectAllContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  selectAllBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },
  selectNoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  selectNoneBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  affectedUsersScrollView: {
    flex: 1,
    padding: 20,
  },
  affectedUsersSection: {
    marginBottom: 24,
  },
  affectedUsersSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  affectedUsersSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  affectedUsersSectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  affectedUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  affectedUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  affectedUserAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  affectedUserDetails: {
    flex: 1,
  },
  affectedUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  affectedUserMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  affectedUserBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  affectedUserBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
  },
  progressBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
  },
  affectedUsersMore: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  emptyAffectedUsers: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyAffectedUsersText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
    textAlign: 'center',
  },
  affectedUsersModalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'center',
  },
  affectedUsersCloseBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  affectedUsersCloseBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default FolderUploadModal;
