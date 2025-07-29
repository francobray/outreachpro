import React, { useState, useEffect } from 'react';
import { Business, DecisionMaker, EmailTemplate } from '../types';
import { X, Send, Loader2, User, Mail, ChevronDown, Eye, FlaskConical } from 'lucide-react';
import EmailPreviewModal from './EmailPreviewModal';
import toast from 'react-hot-toast';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  business: Business | null;
  emailTemplates: EmailTemplate[];
  databaseBusinesses: { [key: string]: any };
  onSendEmail: (dm: DecisionMaker, templateId: string, graderData?: any, emailType?: 'test' | 'real') => Promise<void>;
}

const EmailModal: React.FC<EmailModalProps> = ({ isOpen, onClose, business, emailTemplates, databaseBusinesses, onSendEmail }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [sendingStates, setSendingStates] = useState<{[key: string]: boolean}>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState({ subject: '', body: '' });
  const [testEmail, setTestEmail] = useState<string>('franbreciano@gmail.com');
  const [selectedContactIndex, setSelectedContactIndex] = useState<string>('');
  const [isSendingTest, setIsSendingTest] = useState(false);

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
      toast.error('Please select an email template.');
      return;
    }
    setSendingStates(prev => ({ ...prev, [decisionMaker.id]: true }));
    try {
      await onSendEmail(decisionMaker, selectedTemplateId, business?.graderReport);
    } finally {
      setSendingStates(prev => ({ ...prev, [decisionMaker.id]: false }));
    }
  };

  const handleSendTestEmail = async () => {
    if (!selectedContactIndex) {
      toast.error('Please select a contact for the test email.');
      return;
    }
    if (!selectedTemplateId) {
      toast.error('Please select an email template.');
      return;
    }

    setIsSendingTest(true);
    try {
      // Debug: Log the available decision makers and selected contact ID
      console.log('Available decision makers:', decisionMakers);
      console.log('Selected contact index:', selectedContactIndex);
      
      // Find the selected Apollo contact
      const selectedContact = decisionMakers[parseInt(selectedContactIndex)];
      console.log('Found selected contact:', selectedContact);
      
      if (!selectedContact) {
        toast.error('Selected contact not found.');
        return;
      }

      // For test emails, send to the test email input, not the Apollo contact's email
      const testEmailToSend = testEmail || 'francobreciano@gmail.com';
      
      // Create a temporary decision maker with the test email
      const testDecisionMaker = {
        ...selectedContact,
        email: testEmailToSend
      };
      
      await onSendEmail(testDecisionMaker, selectedTemplateId, business?.graderReport, 'test');
      toast.success(`Test email sent to ${testEmailToSend}`);
    } catch (error) {
      console.error("Failed to send test email", error);
      toast.error('Failed to send test email. Check the console for details.');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handlePreview = (decisionMaker: DecisionMaker) => {
    if (!selectedTemplateId) {
      toast.error('Please select an email template to preview.');
      return;
    }
    
    const template = emailTemplates.find(t => t.id === selectedTemplateId);
    if (!template || !business) return;

    // Get location data for city/state
    const location = business.locations?.[0];
    const cityState = location?.address ? 
      location.address.split(',').slice(-2).join(',').trim() : 
      'Austin, TX'; // Default fallback

    // Use the same variable replacement logic as the email sending
    const variables = {
      '{{LEAD_NAME}}': decisionMaker.name,
      '{{BUSINESS_NAME}}': business.name,
      '{{BUSINESS_CITY_STATE}}': cityState,
      // Use grader data if available, otherwise use defaults
      '{{REVENUE_LOSS}}': business.graderReport?.revenueLoss || '$5,000',
      '{{COMPETITOR_LIST}}': business.graderReport?.competitors?.join(', ') || 'Competitor A, Competitor B',
      '{{HEALTH_GRADE}}': business.graderReport?.healthGrade || 'B+',
      '{{SEARCH_RESULTS_SCORE}}': business.graderReport?.searchResultsScore || '85',
      '{{SEARCH_RESULTS_GRADE}}': business.graderReport?.searchResultsGrade || 'A',
      '{{WEBSITE_EXPERIENCE_SCORE}}': business.graderReport?.websiteExperienceScore || '75',
      '{{LOCAL_LISTINGS_SCORE}}': business.graderReport?.localListingsScore || '90',
      '{{GOOGLE_RATING}}': business.rating ? `${business.rating}/5` : '4.5/5',
      '{{REVIEW_COUNT}}': business.userRatingsTotal?.toString() || '150',
      '{{BUSINESS_CATEGORY}}': business.category || 'Restaurant',
      '{{YEARLY_REVENUE_LOSS}}': business.graderReport?.yearlyRevenueLoss || '$60,000'
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

  // Get Apollo contacts using the same logic as the table
  const dbBusiness = databaseBusinesses[business.placeId];
  const dbContacts = dbBusiness?.decisionMakers || [];
  const sessionDecisionMakers = business.decisionMakers || [];
  
  // Use database contacts if available, otherwise use session data
  const allContacts = dbContacts.length > 0 ? dbContacts : sessionDecisionMakers;
  
  const decisionMakers = allContacts.filter(dm => dm.email && dm.email !== 'email_not_unlocked@domain.com' && !dm.email.includes('not_available') && dm.email.includes('@')) || [];

  return (
    <>
      <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 ${isOpen ? '' : 'hidden'}`}>
        <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Send Email to {business.name}</h3>
              <p className="text-sm text-gray-500">Select a template and a contact to send an email.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <FlaskConical className="h-4 w-4 mr-2 text-blue-600" />
                    Send a Test Email
                  </label>
                  <input
                    type="email"
                    placeholder="Enter email for test"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="w-[70%] pl-3 pr-1 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contacts
                  </label>
                  <div className="flex items-center space-x-2">
                    <div className="relative flex-[1.6]">
                      <select
                        value={selectedContactIndex}
                        onChange={(e) => setSelectedContactIndex(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                        required
                      >
                        <option value="">Select a Contact</option>
                        {decisionMakers.map((dm, index) => (
                          <option key={dm.id} value={index}>
                            {dm.name} - {dm.email}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                    </div>
                    <button
                      onClick={handleSendTestEmail}
                      disabled={isSendingTest || !selectedTemplateId || !selectedContactIndex}
                      className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                    >
                      {isSendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      <span className="ml-2">{isSendingTest ? 'Sending...' : 'Send Test'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Contacts</h4>
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
                <p className="text-sm text-gray-500">No contacts with valid emails found for this business.</p>
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