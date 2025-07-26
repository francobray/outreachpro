import React, { useState, useEffect } from 'react';
import { Business, DecisionMaker, EmailTemplate } from '../types';
import { X, Send, Loader2, User, Mail, ChevronDown, Eye } from 'lucide-react';
import EmailPreviewModal from './EmailPreviewModal';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  business: Business | null;
  emailTemplates: EmailTemplate[];
  onSendEmail: (dm: DecisionMaker, templateId: string) => Promise<void>;
}

const EmailModal: React.FC<EmailModalProps> = ({ isOpen, onClose, business, emailTemplates, onSendEmail }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [sendingStates, setSendingStates] = useState<{[key: string]: boolean}>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState({ subject: '', body: '' });

  useEffect(() => {
    if (emailTemplates.length > 0) {
      const defaultTemplate = emailTemplates.find(t => t.isDefault) || emailTemplates[0];
      setSelectedTemplateId(defaultTemplate.id);
    }
  }, [emailTemplates]);
  
  if (!isOpen || !business) {
    return null;
  }

  const handleSend = async (decisionMaker: DecisionMaker) => {
    if (!selectedTemplateId) {
      alert('Please select an email template.');
      return;
    }
    setSendingStates(prev => ({ ...prev, [decisionMaker.id]: true }));
    try {
      await onSendEmail(decisionMaker, selectedTemplateId);
    } finally {
      setSendingStates(prev => ({ ...prev, [decisionMaker.id]: false }));
    }
  };

  const handlePreview = (decisionMaker: DecisionMaker) => {
    if (!selectedTemplateId) {
      alert('Please select an email template to preview.');
      return;
    }
    
    const template = emailTemplates.find(t => t.id === selectedTemplateId);
    if (!template || !business) return;

    // A more robust variable replacement might be needed depending on the actual variables
    const variables = {
      '{{LEAD_NAME}}': decisionMaker.name,
      '{{BUSINESS_NAME}}': business.name,
      // Add other variables from your grader report here
    };

    let subject = template.subject;
    let body = template.body;

    for (const [key, value] of Object.entries(variables)) {
      subject = subject.replace(new RegExp(key, 'g'), value);
      body = body.replace(new RegExp(key, 'g'), value);
    }
    
    setPreviewContent({ subject, body });
    setIsPreviewOpen(true);
  };

  const decisionMakers = business.decisionMakers?.filter(dm => dm.email && !dm.email.includes('email_not_unlocked') && !dm.email.includes('not_available')) || [];

  return (
    <>
      <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 ${isOpen ? '' : 'hidden'}`}>
        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Send Email to {business.name}</h3>
              <p className="text-sm text-gray-500">Select a template and a contact to send an email.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <label htmlFor="email-template" className="block text-sm font-medium text-gray-700 mb-2">
                Email Template
              </label>
              <div className="relative">
                <select
                  id="email-template"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                >
                  {emailTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Apollo Contacts</h4>
              {decisionMakers.length > 0 ? (
                decisionMakers.map(dm => (
                <div key={dm.id} className="bg-gray-50 p-3 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="flex items-center">
                      <User className="h-4 w-4 mr-2 text-gray-600" />
                      <span className="font-medium text-gray-900">{dm.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{dm.title}</span>
                    </div>
                    <div className="flex items-center mt-1">
                      <Mail className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="text-sm text-blue-600">{dm.email}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handlePreview(dm)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Preview Email"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleSend(dm)}
                      disabled={sendingStates[dm.id] || !selectedTemplateId}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                    >
                      {sendingStates[dm.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      <span className="ml-2">{sendingStates[dm.id] ? 'Sending...' : 'Send'}</span>
                    </button>
                  </div>
                </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No Apollo contacts with valid emails found for this business.</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end p-6 border-t border-gray-200">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
      <EmailPreviewModal 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        subject={previewContent.subject}
        body={previewContent.body}
      />
    </>
  );
};

export default EmailModal;