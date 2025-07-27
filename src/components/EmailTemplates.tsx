import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Plus, 
  Edit3, 
  Trash2, 
  Save, 
  X, 
  Eye, 
  Copy,
  FileText,
  Zap,
  AlertCircle
} from 'lucide-react';
import AlertModal from './AlertModal';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  text: string;
  description?: string;
  category?: string;
  variables?: Array<{
    name: string;
    description: string;
    defaultValue: string;
  }>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Variable {
  key: string;
  label: string;
  description: string;
  example: string;
}

const EmailTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    html: '',
    text: ''
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    name: '',
    subject: '',
    html: '',
    text: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success' | 'confirm';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  // Available variables for email templates
  const variables: Variable[] = [
    {
      key: '{{LEAD_NAME}}',
      label: 'Lead Name',
      description: 'The name of the business owner or decision maker',
      example: 'John Doe'
    },
    {
      key: '{{BUSINESS_NAME}}',
      label: 'Business Name',
      description: 'The name of the business from the search results',
      example: 'Temple Wynwood'
    },
    {
      key: '{{LEAD_EMAIL}}',
      label: 'Lead Email',
      description: 'Primary email address found for the business',
      example: 'info@templewynwood.com'
    },
    {
      key: '{{BUSINESS_CITY_STATE}}',
      label: 'Business City/State',
      description: 'City and state where the business is located',
      example: 'Miami, FL'
    },
    {
      key: '{{AUDIT_SCORE}}',
      label: 'Audit Score',
      description: 'Business audit report score out of 100',
      example: '87'
    },
    {
      key: '{{BUSINESS_ADDRESS}}',
      label: 'Business Address',
      description: 'Full address of the business',
      example: '151 NW 24th St #102, Miami, FL 33127, USA'
    },
    {
      key: '{{BUSINESS_WEBSITE}}',
      label: 'Business Website',
      description: 'Website URL if available',
      example: 'https://bluebottlecoffee.com'
    },
    {
      key: '{{REVENUE_LOSS}}',
      label: 'Revenue Loss',
      description: 'Estimated potential revenue loss per month',
      example: '$7,950'
    },
    {
      key: '{{COMPETITOR_LIST}}',
      label: 'Competitor List',
      description: 'A list of top local competitors',
      example: '1. Pastis Miami, 2. Syndicate Wynwood'
    },
    {
      key: '{{HEALTH_GRADE}}',
      label: 'Health Grade',
      description: 'The overall health grade of the business (e.g., Fair, Good, Poor)',
      example: 'Fair'
    },
    {
      key: '{{SEARCH_RESULTS_SCORE}}',
      label: 'Search Results Score',
      description: 'The score for search result presence (e.g., 3/40)',
      example: '3/40'
    },
    {
      key: '{{SEARCH_RESULTS_GRADE}}',
      label: 'Search Results Grade',
      description: 'The grade for search result presence (e.g., Poor)',
      example: 'Poor'
    },
    {
      key: '{{WEBSITE_EXPERIENCE_SCORE}}',
      label: 'Website Experience Score',
      description: 'The score for website user experience (e.g., 37/40)',
      example: '37/40'
    },
    {
      key: '{{LOCAL_LISTINGS_SCORE}}',
      label: 'Local Listings Score',
      description: 'The score for local listings accuracy and presence (e.g., 20/20)',
      example: '20/20'
    },
    {
      key: '{{GOOGLE_RATING}}',
      label: 'Google Rating',
      description: 'The average Google rating (e.g., 4.8/5)',
      example: '4.8/5'
    },
    {
      key: '{{REVIEW_COUNT}}',
      label: 'Review Count',
      description: 'The total number of Google reviews',
      example: '669'
    },
    {
      key: '{{BUSINESS_CATEGORY}}',
      label: 'Business Category',
      description: 'The primary category of the business (e.g., Bar, Restaurant)',
      example: 'Bar'
    },
    {
      key: '{{YEARLY_REVENUE_LOSS}}',
      label: 'Yearly Revenue Loss',
      description: 'Estimated potential revenue loss per year',
      example: '$95,400'
    }
  ];

  // Load templates from database on component mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/email-templates');
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }
      const data = await response.json();
      setTemplates(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = () => {
    setShowCreateModal(true);
    setCreateFormData({ name: '', subject: '', html: '', text: '' });
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setShowEditModal(true);
    setFormData({
      name: template.name,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
    setEditingTemplate(template);
  };

  const handleSaveTemplate = async () => {
    if (!createFormData.name.trim() || !createFormData.subject.trim() || !createFormData.html.trim()) {
      return;
    }

    try {
      const response = await fetch('/api/email-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: createFormData.name.trim(),
          subject: createFormData.subject.trim(),
          html: createFormData.html.trim(),
          text: createFormData.text.trim(),
          category: 'custom'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create template');
      }

      await fetchTemplates();
      handleCancelCreate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    }
  };

  const handleSaveEditTemplate = async () => {
    if (!formData.name.trim() || !formData.subject.trim() || !formData.html.trim()) {
      return;
    }

    if (!editingTemplate) return;

    try {
      const response = await fetch(`/api/email-templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          subject: formData.subject.trim(),
          html: formData.html.trim(),
          text: formData.text.trim()
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update template');
      }

      await fetchTemplates();
      handleCancelEditTemplate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template');
    }
  };

  const handleCancelCreate = () => {
    setShowCreateModal(false);
    setCreateFormData({ name: '', subject: '', html: '', text: '' });
  };

  const handleCancelEditTemplate = () => {
    setShowEditModal(false);
    setEditingTemplate(null);
    setFormData({ name: '', subject: '', html: '', text: '' });
  };

  const handleDeleteTemplate = async (templateId: string) => {
    setAlertModal({
      isOpen: true,
      title: 'Delete Template',
      message: 'Are you sure you want to delete this template?',
      type: 'confirm',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/email-templates/${templateId}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            throw new Error('Failed to delete template');
          }

          await fetchTemplates();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to delete template');
        }
      }
    });
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      const response = await fetch(`/api/email-templates/${templateId}/default`, {
        method: 'PUT',
      });

      if (!response.ok) {
        throw new Error('Failed to set default template');
      }

      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default template');
    }
  };

  const handleDuplicateTemplate = async (template: EmailTemplate) => {
    try {
      const response = await fetch('/api/email-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          subject: template.subject,
          html: template.html,
          text: template.text,
          category: template.category || 'custom'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to duplicate template');
      }

      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate template');
    }
  };

  const insertVariable = (variable: string) => {
    let textarea: HTMLTextAreaElement | null = null;
    
    if (showEditModal && editingTemplate) {
      textarea = document.getElementById('template-body') as HTMLTextAreaElement;
    } else if (showCreateModal) {
      textarea = document.getElementById('create-template-body') as HTMLTextAreaElement;
    }
    
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      if (showEditModal && editingTemplate) {
        const text = formData.html;
        const newText = text.substring(0, start) + variable + text.substring(end);
        setFormData(prev => ({ ...prev, html: newText }));
      } else if (showCreateModal) {
        const text = createFormData.html;
        const newText = text.substring(0, start) + variable + text.substring(end);
        setCreateFormData(prev => ({ ...prev, html: newText }));
      }
      
      // Restore cursor position
      setTimeout(() => {
        textarea!.focus();
        textarea!.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
  };

  const getPreviewText = (template: EmailTemplate) => {
    const sampleData = {
      '{{LEAD_NAME}}': 'John Doe',
      '{{BUSINESS_NAME}}': 'Temple Wynwood',
      '{{LEAD_EMAIL}}': 'info@templewynwood.com',
      '{{BUSINESS_CITY_STATE}}': 'Miami, FL',
      '{{AUDIT_SCORE}}': '53',
      '{{BUSINESS_ADDRESS}}': '151 NW 24th St #102, Miami, FL 33127, USA',
      '{{BUSINESS_WEBSITE}}': 'https://bluebottlecoffee.com',
      '{{REVENUE_LOSS}}': '$7,950',
      '{{COMPETITOR_LIST}}': '1. Pastis Miami, 2. Syndicate Wynwood',
      '{{HEALTH_GRADE}}': 'Fair',
      '{{SEARCH_RESULTS_SCORE}}': '3/40',
      '{{SEARCH_RESULTS_GRADE}}': 'Poor',
      '{{WEBSITE_EXPERIENCE_SCORE}}': '37/40',
      '{{LOCAL_LISTINGS_SCORE}}': '20/20',
      '{{GOOGLE_RATING}}': '4.8/5',
      '{{REVIEW_COUNT}}': '669',
      '{{BUSINESS_CATEGORY}}': 'Bar',
      '{{YEARLY_REVENUE_LOSS}}': '$95,400'
    };

    let previewSubject = template.subject;
    let previewBody = template.html;

    Object.entries(sampleData).forEach(([variable, value]) => {
      previewSubject = previewSubject.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
      previewBody = previewBody.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    return { subject: previewSubject, body: previewBody };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading email templates...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">Error: {error}</p>
          <button
            onClick={fetchTemplates}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Email Templates</h2>
          <p className="text-gray-600 mt-1">Create and manage email templates for your outreach campaigns</p>
        </div>
        <button
          onClick={handleCreateTemplate}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5 mr-2" />
          New Template
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No templates yet</h3>
            <p className="text-gray-600 mb-4">Create your first email template to get started with outreach campaigns.</p>
            <button
              onClick={handleCreateTemplate}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create Template
            </button>
          </div>
        ) : (
          templates.map((template) => (
            <div key={template.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-7">
              <div className="flex items-start justify-between mb-5">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                    {template.isDefault && (
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    <strong>Subject:</strong> {template.subject}
                  </p>
                  <p className="text-xs text-gray-500">
                    Updated {new Date(template.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleDuplicateTemplate(template)}
                    className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="Duplicate"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleEditTemplate(template)}
                    className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  {!template.isDefault && (
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-5">
                <p className="text-sm text-gray-700 line-clamp-4">
                  {template.html.substring(0, 250)}...
                </p>
              </div>

              {!template.isDefault && (
                <button
                  onClick={() => handleSetDefault(template.id)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Set as Default
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Edit Template Modal */}
      {showEditModal && editingTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <Edit3 className="h-5 w-5 text-orange-600" />
                <h3 className="text-lg font-semibold text-gray-900">Edit Template</h3>
              </div>
              <button
                onClick={handleCancelEditTemplate}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="flex flex-grow overflow-hidden">
              {/* Template Form */}
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="edit-template-name" className="block text-sm font-medium text-gray-700 mb-2">
                      Template Name
                    </label>
                    <input
                      id="edit-template-name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Business Audit Outreach"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-template-subject" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Subject
                    </label>
                    <input
                      id="edit-template-subject"
                      type="text"
                      value={formData.subject}
                      onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="e.g., Free Business Audit Report for {{LEAD_NAME}}"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="template-body" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Body
                    </label>
                    <div className="relative">
                      <div 
                        className="w-full px-3 py-2 border border-transparent rounded-lg font-mono text-sm whitespace-pre-wrap pointer-events-none absolute inset-0"
                        dangerouslySetInnerHTML={{ __html: formData.html.replace(/({{[A-Z_]+}})/g, '<span class="text-blue-600 bg-blue-100 rounded">$1</span>') + '<br/>' }}
                      />
                      <textarea
                        id="template-body"
                        value={formData.html}
                        onChange={(e) => setFormData(prev => ({ ...prev, html: e.target.value }))}
                        placeholder="Write your email template here, including your signature. Use variables like {{LEAD_NAME}} to personalize..."
                        rows={28}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm relative bg-transparent caret-gray-800"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Variables Sidebar */}
              <div className="w-80 border-l border-gray-200 p-6 overflow-y-auto bg-gray-50">
                <div className="flex items-center space-x-2 mb-4">
                  <Zap className="h-5 w-5 text-yellow-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Available Variables</h3>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Click any variable to insert it into your template at the cursor position.
                </p>
                
                <div className="space-y-3">
                  {variables.map((variable) => (
                    <div key={variable.key} className="border border-gray-200 rounded-lg p-3 bg-white">
                      <button
                        onClick={() => insertVariable(variable.key)}
                        className="w-full text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <code className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            {variable.key}
                          </code>
                        </div>
                        <p className="text-sm font-medium text-gray-900">{variable.label}</p>
                        <p className="text-xs text-gray-600 mb-1">{variable.description}</p>
                        <p className="text-xs text-gray-500">
                          <strong>Example:</strong> {variable.example}
                        </p>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-amber-800">Template Tips</h4>
                      <ul className="text-xs text-amber-700 mt-1 space-y-1">
                        <li>• Click variables above to insert them</li>
                        <li>• Use personalization for better response rates</li>
                        <li>• Keep emails concise and value-focused</li>
                        <li>• Test templates before bulk campaigns</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 flex-shrink-0">
              <button
                onClick={handleCancelEditTemplate}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditTemplate}
                disabled={!formData.name.trim() || !formData.subject.trim() || !formData.html.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                <Save className="h-4 w-4" />
                <span>Save Template</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <Plus className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Create New Template</h3>
              </div>
              <button
                onClick={handleCancelCreate}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="flex flex-grow overflow-hidden">
              {/* Template Form */}
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="create-template-name" className="block text-sm font-medium text-gray-700 mb-2">
                      Template Name
                    </label>
                    <input
                      id="create-template-name"
                      type="text"
                      value={createFormData.name}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Business Audit Outreach"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="create-template-subject" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Subject
                    </label>
                    <input
                      id="create-template-subject"
                      type="text"
                      value={createFormData.subject}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="e.g., Free Business Audit Report for {{LEAD_NAME}}"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label htmlFor="create-template-body" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Body
                    </label>
                    <div className="relative">
                      <div
                        className="w-full px-3 py-2 border border-transparent rounded-lg font-mono text-sm whitespace-pre-wrap pointer-events-none absolute inset-0"
                        dangerouslySetInnerHTML={{ __html: createFormData.html.replace(/({{[A-Z_]+}})/g, '<span class="text-blue-600 bg-blue-100 rounded">$1</span>') + '<br/>' }}
                      />
                      <textarea
                        id="create-template-body"
                        value={createFormData.html}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, html: e.target.value }))}
                        placeholder="Write your email template here, including your signature. Use variables like {{LEAD_NAME}} to personalize..."
                        rows={28}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm relative bg-transparent caret-gray-800"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Variables Sidebar */}
              <div className="w-80 border-l border-gray-200 p-6 overflow-y-auto bg-gray-50">
                <div className="flex items-center space-x-2 mb-4">
                  <Zap className="h-5 w-5 text-yellow-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Available Variables</h3>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Click any variable to insert it into your template at the cursor position.
                </p>
                
                <div className="space-y-3">
                  {variables.map((variable) => (
                    <div key={variable.key} className="border border-gray-200 rounded-lg p-3 bg-white">
                      <button
                        onClick={() => insertVariable(variable.key)}
                        className="w-full text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <code className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            {variable.key}
                          </code>
                        </div>
                        <p className="text-sm font-medium text-gray-900">{variable.label}</p>
                        <p className="text-xs text-gray-600 mb-1">{variable.description}</p>
                        <p className="text-xs text-gray-500">
                          <strong>Example:</strong> {variable.example}
                        </p>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-amber-800">Template Tips</h4>
                      <ul className="text-xs text-amber-700 mt-1 space-y-1">
                        <li>• Click variables above to insert them</li>
                        <li>• Use personalization for better response rates</li>
                        <li>• Keep emails concise and value-focused</li>
                        <li>• Test templates before bulk campaigns</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 flex-shrink-0">
              <button
                onClick={handleCancelCreate}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!createFormData.name.trim() || !createFormData.subject.trim() || !createFormData.html.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                <Save className="h-4 w-4" />
                <span>Create Template</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <Eye className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Template Preview</h3>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 max-h-[calc(90vh-140px)] overflow-y-auto">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-xs text-gray-600 mb-2">Preview with sample data:</p>
                <div className="space-y-2">
                  <div><strong>Subject:</strong> {getPreviewText(previewTemplate).subject}</div>
                </div>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="whitespace-pre-wrap text-sm text-gray-800">
                  {getPreviewText(previewTemplate).body}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        onConfirm={alertModal.onConfirm}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        confirmText="Delete"
        cancelText="Cancel"
      />
    </div>
  );
};

export default EmailTemplates;