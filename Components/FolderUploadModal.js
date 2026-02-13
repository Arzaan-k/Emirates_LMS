import React, { useState, useRef } from 'react';
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

  // Duplicate Modal State
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [duplicateFiles, setDuplicateFiles] = useState([]);
  const [duplicateAction, setDuplicateAction] = useState('skip'); // 'skip' or 'replace'

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
            type: entry.type || getFileType(part)
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
        <TouchableOpacity
          key={file.path}
          style={[styles.treeItem, { marginLeft: level * 20 }]}
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
  treeItem: {
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
});

export default FolderUploadModal;
