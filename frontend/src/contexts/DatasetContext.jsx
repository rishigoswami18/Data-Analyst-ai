import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from './AuthContext';

const DatasetContext = createContext(null);

function createWelcomeMessage(dataset) {
  const label = dataset?.filename
    ? `Dataset ready: ${dataset.filename}. Ask for trends, KPIs, comparisons, or charts.`
    : 'Upload a dataset to begin analysis.';

  return [
    {
      id: `welcome-${dataset?.id || 'empty'}`,
      role: 'assistant',
      content: label,
      chartUrl: null
    }
  ];
}

async function parseJson(response) {
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong.');
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export function DatasetProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [currentDataset, setCurrentDataset] = useState(null);
  const [recentDatasets, setRecentDatasets] = useState([]);
  const [messages, setMessages] = useState(createWelcomeMessage(null));
  const [bootstrapping, setBootstrapping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);

  function resetDatasetState(message = null) {
    setCurrentDataset(null);
    setMessages(
      message
        ? [
            {
              id: `system-${Date.now()}`,
              role: 'assistant',
              content: message,
              chartUrl: null
            }
          ]
        : createWelcomeMessage(null)
    );
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentDataset(null);
      setRecentDatasets([]);
      setMessages(createWelcomeMessage(null));
      return;
    }

    let active = true;

    async function bootstrap() {
      setBootstrapping(true);
      try {
        const [currentResponse, recentResponse] = await Promise.all([
          fetch('/api/datasets/current', { credentials: 'same-origin' }),
          fetch('/api/datasets/recent', { credentials: 'same-origin' })
        ]);

        const currentData = await currentResponse.json();
        const recentData = await recentResponse.json();

        if (!active) return;

        const dataset = currentData.dataset || null;
        setCurrentDataset(dataset);
        setRecentDatasets(recentData.datasets || []);
        setMessages((prevMessages) => {
          const hasConversation = prevMessages.some((message) => message.role === 'user');
          return hasConversation ? prevMessages : createWelcomeMessage(dataset);
        });
      } catch {
        if (!active) return;
        setCurrentDataset(null);
        setRecentDatasets([]);
        setMessages(createWelcomeMessage(null));
      } finally {
        if (active) {
          setBootstrapping(false);
        }
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  async function uploadDataset(file) {
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);

    try {
      const data = await parseJson(
        await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          credentials: 'same-origin'
        })
      );

      setCurrentDataset(data.dataset_summary);
      setRecentDatasets(data.recent_datasets || []);
      setMessages(createWelcomeMessage(data.dataset_summary));
      return data.dataset_summary;
    } finally {
      setUploading(false);
    }
  }

  async function sendMessage(text) {
    if (!currentDataset) {
      throw new Error('Please upload a dataset before starting analysis.');
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      chartUrl: null
    };

    const optimisticMessages = [...messages, userMessage];
    setMessages(optimisticMessages);
    setChatLoading(true);

    try {
      const data = await parseJson(
        await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            message: text,
            history: optimisticMessages.map((message) => ({
              role: message.role,
              content: message.content
            }))
          })
        })
      );

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        chartUrl: data.chart_url || null
      };

      setMessages([...optimisticMessages, assistantMessage]);
      return assistantMessage;
    } catch (error) {
      setMessages(messages);
      if (error.status === 410 && error.payload?.dataset_missing) {
        resetDatasetState(
          'Your previous upload is no longer available on the server. Please upload the dataset again to continue analysis.'
        );
      }
      throw error;
    } finally {
      setChatLoading(false);
    }
  }

  const value = useMemo(
    () => ({
      currentDataset,
      recentDatasets,
      messages,
      bootstrapping,
      uploading,
      chatLoading,
      uploadDataset,
      sendMessage,
      resetDatasetState
    }),
    [bootstrapping, chatLoading, currentDataset, messages, recentDatasets, uploading]
  );

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset() {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error('useDataset must be used within a DatasetProvider');
  }
  return context;
}
