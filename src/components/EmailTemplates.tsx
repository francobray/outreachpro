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

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
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
    body: ''
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    name: '',
    subject: '',
    body: ''
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

  // Load templates from localStorage on component mount
  useEffect(() => {
    const savedTemplatesJSON = localStorage.getItem('emailTemplates');
    const allStoredTemplates: EmailTemplate[] = savedTemplatesJSON ? JSON.parse(savedTemplatesJSON) : [];

    const now = new Date().toISOString();
    
    const defaultTemplatesInCode: EmailTemplate[] = [
        {
          id: 'default-1',
          name: 'Business Audit Outreach',
          subject: 'Free Business Audit Report for {{BUSINESS_NAME}}',
          body: `Hi {{LEAD_NAME}},

I hope this email finds you well. I recently came across {{BUSINESS_NAME}} in {{BUSINESS_CITY_STATE}} and was impressed by your business.

I've prepared a complimentary business audit report that highlights some opportunities for growth and improvement. Based on my analysis, your business scored {{AUDIT_SCORE}}/100, which shows great potential with some strategic improvements.

Key findings include:
• Website optimization opportunities
• Local SEO improvements  
• Customer engagement strategies

I'd love to discuss how we can help you implement these recommendations to drive more customers to your business.

Would you be interested in a brief 15-minute call this week to go over the findings?

Best regards,
[Your Name]`,
          isDefault: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'default-2',
          name: 'Unlock Hidden Revenue',
          subject: 'Is {{BUSINESS_NAME}} losing {{REVENUE_LOSS}} each month?',
          body: `Hi {{LEAD_NAME}},

I ran a quick digital health check for businesses in {{BUSINESS_CITY_STATE}} and discovered an opportunity for you.

My analysis shows that {{BUSINESS_NAME}} could be losing an estimated {{REVENUE_LOSS}} in potential revenue each month due to low visibility in Google search results. This happens when customers can't find you easily, and instead find your competitors.

I have a full report that pinpoints these issues. I'd be happy to walk you through it and show you how to improve your search ranking to capture that lost revenue.

Are you available for a brief chat next week?

Best regards,
[Your Name]`,
          isDefault: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'default-3',
          name: 'Competitive Search Analysis',
          subject: 'How {{BUSINESS_NAME}} can outrank local competitors',
          body: `Hi {{LEAD_NAME}},

I was looking at the competitive landscape for businesses like yours in {{BUSINESS_CITY_STATE}}, and I noticed something you should see.

Your business, {{BUSINESS_NAME}}, is currently being outranked on Google by several key competitors, including:
{{COMPETITOR_LIST}}

This means potential customers looking for your services are likely finding them first. The good news is that this is fixable.

I have a report that breaks down why you're being outranked and the specific steps you can take to claim a top spot.

Would you be open to a quick 15-minute call to review these insights?

Regards,
[Your Name]`,
          isDefault: false,
          createdAt: now,
          updatedAt: now
        }
    ];

    const defaultTemplateIds = new Set(defaultTemplatesInCode.map(t => t.id));
    const customTemplates = allStoredTemplates.filter(t => !defaultTemplateIds.has(t.id));

    const finalTemplates = [...defaultTemplatesInCode, ...customTemplates];

    // Default selection logic:
    // 1. Prefer a user's custom default template.
    // 2. Fallback to default-1.
    // 3. Fallback to the first template in the list.
    let defaultId: string | null = null;
    const customDefault = customTemplates.find(t => t.isDefault);
    if (customDefault) {
        defaultId = customDefault.id;
    } else if (finalTemplates.find(t => t.id === 'default-1')) {
        defaultId = 'default-1';
    } else if (finalTemplates.length > 0) {
        defaultId = finalTemplates[0].id;
    }

    // Apply the default flag to the selected template
    finalTemplates.forEach(t => t.isDefault = (t.id === defaultId));
    
    setTemplates(finalTemplates);
    localStorage.setItem('emailTemplates', JSON.stringify(finalTemplates));
  }, []);

  // Save templates to localStorage whenever templates change
  useEffect(() => {
    if (templates.length > 0) {
      localStorage.setItem('emailTemplates', JSON.stringify(templates));
    }
  }, [templates]);

  const handleCreateTemplate = () => {
    setShowCreateModal(true);
    setCreateFormData({ name: '', subject: '', body: '' });
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setShowEditModal(true);
    setFormData({
      name: template.name,
      subject: template.subject,
      body: template.body
    });
    setEditingTemplate(template);
  };

  const handleSaveTemplate = () => {
    if (!createFormData.name.trim() || !createFormData.subject.trim() || !createFormData.body.trim()) {
      return;
    }

    const now = new Date().toISOString();

    const newTemplate: EmailTemplate = {
      id: `template-${Date.now()}`,
      name: createFormData.name.trim(),
      subject: createFormData.subject.trim(),
      body: createFormData.body.trim(),
      isDefault: templates.length === 0,
      createdAt: now,
      updatedAt: now
    };
    setTemplates(prev => [...prev, newTemplate]);
    handleCancelCreate();
  };

  const handleSaveEditTemplate = () => {
    if (!formData.name.trim() || !formData.subject.trim() || !formData.body.trim()) {
      return;
    }

    const now = new Date().toISOString();

    if (editingTemplate) {
      setTemplates(prev => prev.map(t => 
        t.id === editingTemplate.id 
          ? { ...t, ...formData, updatedAt: now }
          : t
      ));
    }

    handleCancelEditTemplate();
  };

  const handleCancelCreate = () => {
    setShowCreateModal(false);
    setCreateFormData({ name: '', subject: '', body: '' });
  };

  const handleCancelEditTemplate = () => {
    setShowEditModal(false);
    setEditingTemplate(null);
    setFormData({ name: '', subject: '', body: '' });
  };

  const handleDeleteTemplate = (templateId: string) => {
    if (confirm('Are you sure you want to delete this template?')) {
      setTemplates(prev => prev.filter(t => t.id !== templateId));
    }
  };

  const handleSetDefault = (templateId: string) => {
    setTemplates(prev => prev.map(t => ({
      ...t,
      isDefault: t.id === templateId
    })));
  };

  const handleDuplicateTemplate = (template: EmailTemplate) => {
    const duplicatedTemplate: EmailTemplate = {
      ...template,
      id: `template-${Date.now()}`,
      name: `${template.name} (Copy)`,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setTemplates(prev => [...prev, duplicatedTemplate]);
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
        const text = formData.body;
        const newText = text.substring(0, start) + variable + text.substring(end);
        setFormData(prev => ({ ...prev, body: newText }));
      } else if (showCreateModal) {
        const text = createFormData.body;
        const newText = text.substring(0, start) + variable + text.substring(end);
        setCreateFormData(prev => ({ ...prev, body: newText }));
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
    let previewBody = template.body;

    Object.entries(sampleData).forEach(([variable, value]) => {
      previewSubject = previewSubject.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
      previewBody = previewBody.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    return { subject: previewSubject, body: previewBody };
  };

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Templates List */}
        <div className="md:col-span-2 space-y-4 mb-6">
          {templates.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
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
              <div key={template.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                      {template.isDefault && (
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      <strong>Subject:</strong> {template.subject}
                    </p>
                    <p className="text-xs text-gray-500">
                      Updated {new Date(template.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setPreviewTemplate(template)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Preview"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
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
                
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <p className="text-sm text-gray-700 line-clamp-3">
                    {template.body.substring(0, 200)}...
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
                        dangerouslySetInnerHTML={{ __html: formData.body.replace(/({{[A-Z_]+}})/g, '<span class="text-blue-600 bg-blue-100 rounded">$1</span>') + '<br/>' }}
                      />
                      <textarea
                        id="template-body"
                        value={formData.body}
                        onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
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
                disabled={!formData.name.trim() || !formData.subject.trim() || !formData.body.trim()}
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
                        dangerouslySetInnerHTML={{ __html: createFormData.body.replace(/({{[A-Z_]+}})/g, '<span class="text-blue-600 bg-blue-100 rounded">$1</span>') + '<br/>' }}
                      />
                      <textarea
                        id="create-template-body"
                        value={createFormData.body}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, body: e.target.value }))}
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
                disabled={!createFormData.name.trim() || !createFormData.subject.trim() || !createFormData.body.trim()}
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
    </div>
  );
};

export default EmailTemplates;