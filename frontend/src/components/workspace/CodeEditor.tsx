import React, { useRef, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';

interface CodeEditorProps {
    content: string;
    language?: string;
    path?: string;
    onChange: (value: string | undefined) => void;
    onSave: () => void;
    readOnly?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ 
    content, 
    language = 'plaintext', 
    path,
    onChange, 
    onSave,
    readOnly = false
}) => {
    const monaco = useMonaco();
    const editorRef = useRef<any>(null);

    // Setup custom theme and keybindings
    useEffect(() => {
        if (monaco) {
            monaco.editor.defineTheme('ica-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: '', background: '111917' } // Match our bg-[#111917]
                ],
                colors: {
                    'editor.background': '#111917',
                    'editor.foreground': '#E6F1EC',
                    'editor.lineHighlightBackground': '#1A242066',
                    'editor.selectionBackground': '#2EFF7B22',
                    'editor.selectionHighlightBackground': '#2EFF7B11',
                    'editor.wordHighlightBackground': '#2EFF7B15',
                    'editorCursor.foreground': '#2EFF7B',
                    'editorLineNumber.foreground': '#3A4F46',
                    'editorLineNumber.activeForeground': '#8FAEA2',
                    'editorIndentGuide.background': '#1F2D28',
                    'editorIndentGuide.activeBackground': '#2EFF7B33',
                    'editorBracketMatch.background': '#2EFF7B15',
                    'editorBracketMatch.border': '#2EFF7B55',
                    'editorBracketHighlight.foreground1': '#2EFF7B',
                    'editorBracketHighlight.foreground2': '#69B4E6',
                    'editorBracketHighlight.foreground3': '#E6CD69',
                    'editorBracketHighlight.foreground4': '#BD93F9',
                    'editorSuggestWidget.background': '#0B0F0E',
                    'editorSuggestWidget.border': '#1F2D28',
                    'editorSuggestWidget.selectedBackground': '#1A2420',
                    'scrollbarSlider.background': '#1F2D2855',
                    'scrollbarSlider.hoverBackground': '#2EFF7B33',
                    'scrollbarSlider.activeBackground': '#2EFF7B55',
                    'editorOverviewRuler.border': '#1F2D28',
                    'editorGutter.background': '#111917',
                }
            });
            monaco.editor.setTheme('ica-dark');
        }
    }, [monaco]);

    const handleEditorDidMount = (editor: any, monacoInstance: any) => {
        editorRef.current = editor;

        // Add Ctrl+S / Cmd+S save action
        editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
            onSave();
        });
    };

    // Auto-detect language if not provided
    const getLanguage = () => {
        if (!path) return language;
        const ext = path.split('.').pop()?.toLowerCase();
        const map: Record<string, string> = {
            'js': 'javascript', 'ts': 'typescript', 'jsx': 'javascript', 'tsx': 'typescript',
            'py': 'python', 'json': 'json', 'html': 'html', 'css': 'css',
            'md': 'markdown', 'go': 'go', 'rs': 'rust', 'java': 'java',
            'cpp': 'cpp', 'c': 'c', 'sh': 'shell', 'yaml': 'yaml', 'yml': 'yaml'
        };
        return map[ext || ''] || language;
    };

    return (
        <div className="w-full h-full bg-[#111917]">
            <Editor
                height="100%"
                language={getLanguage()}
                value={content}
                theme="ica-dark"
                path={path} // Helps Monaco with features like cross-file intellisense if supported
                onChange={onChange}
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                    fontLigatures: true,
                    wordWrap: 'on',
                    padding: { top: 16, bottom: 16 },
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    formatOnPaste: true,
                    readOnly: readOnly,
                    suggestSelection: 'first',
                    bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
                    guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: true },
                    renderLineHighlightOnlyWhenFocus: false,
                    'semanticHighlighting.enabled': true,
                }}
                loading={
                    <div className="h-full w-full flex items-center justify-center text-[#5A7268]">
                        Loading Editor...
                    </div>
                }
            />
        </div>
    );
};
