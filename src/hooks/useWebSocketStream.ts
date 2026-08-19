import { useState, useRef, useEffect } from 'react';

interface WebSocketStreamOptions {
  backendPort: number;
  activeSessionId: string | null;
  setChatHistory: React.Dispatch<React.SetStateAction<any[]>>;
  setSessions: React.Dispatch<React.SetStateAction<any[]>>;
  setPendingAuthRequest: (req: { code: string } | null) => void;
  showToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export function useWebSocketStream({
  backendPort,
  activeSessionId,
  setChatHistory,
  setSessions,
  setPendingAuthRequest,
  showToast
}: WebSocketStreamOptions) {
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const streamingBufferRef = useRef<string>("");
  const updateIntervalRef = useRef<any>(null);
  const lastGeneratedScriptRef = useRef<string | null>(null);

  useEffect(() => {
    if (backendPort === 0) return;

    const wsUrl = `ws://127.0.0.1:${backendPort}/ws`;
    let ws: WebSocket | null = null;
    let wsActive = true;
    let reconnectTimer: any = null;

    const connectWS = () => {
      if (!wsActive) return;
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'token') {
              setIsGenerating(true);
              streamingBufferRef.current += data.content || '';

              if (!updateIntervalRef.current) {
                updateIntervalRef.current = setInterval(() => {
                  if (streamingBufferRef.current !== '') {
                    const textToAppend = streamingBufferRef.current;
                    streamingBufferRef.current = '';

                    setChatHistory(prev => {
                      if (prev.length === 0) return prev;
                      const newArr = [...prev];
                      const lastIdx = newArr.length - 1;
                      if (newArr[lastIdx].role === 'assistant') {
                        newArr[lastIdx] = {
                          ...newArr[lastIdx],
                          content: (newArr[lastIdx].content || '') + textToAppend
                        };
                      }
                      return newArr;
                    });
                  }
                }, 40);
              }
            } else if (data.type === 'status_line') {
              const line = data.content || '';
              setChatHistory(prev => {
                if (prev.length === 0) return prev;
                const newArr = [...prev];
                const lastIdx = newArr.length - 1;
                if (newArr[lastIdx].role === 'assistant') {
                  const cur = newArr[lastIdx].content || '';
                  newArr[lastIdx] = {
                    ...newArr[lastIdx],
                    content: cur + (cur.endsWith('\n') || cur === '' ? '' : '\n') + line + '\n'
                  };
                }
                return newArr;
              });
            } else if (data.type === 'auth_request') {
              setPendingAuthRequest({ code: data.code || '' });
            } else if (data.type === 'done' || data.type === 'error') {
              setIsGenerating(false);
              if (updateIntervalRef.current) {
                clearInterval(updateIntervalRef.current);
                updateIntervalRef.current = null;
              }
              if (streamingBufferRef.current !== '') {
                const textToAppend = streamingBufferRef.current;
                streamingBufferRef.current = '';
                setChatHistory(prev => {
                  if (prev.length === 0) return prev;
                  const newArr = [...prev];
                  const lastIdx = newArr.length - 1;
                  if (newArr[lastIdx].role === 'assistant') {
                    newArr[lastIdx] = {
                      ...newArr[lastIdx],
                      content: (newArr[lastIdx].content || '') + textToAppend
                    };
                  }
                  return newArr;
                });
              }
              if (data.type === 'error' && showToast) {
                showToast(`Stream error: ${data.message || 'Unknown error'}`, 'error');
              }
            }
          } catch (e) {
            console.error('WS JSON parse error:', e);
          }
        };

        ws.onclose = () => {
          setIsWsConnected(false);
          if (wsActive) {
            reconnectTimer = setTimeout(connectWS, 3000);
          }
        };

        ws.onerror = (err) => {
          console.error('[WS Error]', err);
        };
      } catch (err) {
        console.error('[WS Setup Error]', err);
      }
    };

    connectWS();

    return () => {
      wsActive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
      if (updateIntervalRef.current) clearInterval(updateIntervalRef.current);
    };
  }, [backendPort]);

  return {
    isWsConnected,
    isGenerating,
    setIsGenerating,
    wsRef,
    streamingBufferRef,
    lastGeneratedScriptRef
  };
}
