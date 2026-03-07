/**
 * TextBlockEditor
 *
 * Destination: packages/frontend/src/components/DocumentComposer/TextBlockEditor.tsx
 *
 * TipTap rich-text editor for a single document block.
 * Supports: bold, italic, headings H1-H3, bullet lists, ordered lists.
 * {{placeholder}} text is rendered as-is during authoring; resolution happens at export/render time.
 *
 * Required packages (add to packages/frontend/package.json):
 *   "@tiptap/react": "^2.11.0"
 *   "@tiptap/pm": "^2.11.0"
 *   "@tiptap/starter-kit": "^2.11.0"
 *   "@tiptap/extension-placeholder": "^2.11.0"
 *
 * Install:
 *   cd packages/frontend && npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder
 */

import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading1, Heading2, Heading3, Italic, List, ListOrdered } from 'lucide-react';
import React, { useEffect } from 'react';

import { TipTapDoc } from '../../types/document.types';

interface TextBlockEditorProps {
  content: TipTapDoc | undefined;
  onChange: (doc: TipTapDoc) => void;
  placeholder?: string;
  readonly?: boolean;
}

const TextBlockEditor: React.FC<TextBlockEditorProps> = ({
  content,
  onChange,
  placeholder: placeholderText = 'Start typing…',
  readonly = false,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: placeholderText }),
    ],
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: !readonly,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getJSON() as TipTapDoc);
    },
  });

  // Sync content when block changes externally (e.g. loading a different template)
  useEffect(() => {
    if (!editor || !content) return;
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(content);
    if (current !== incoming) {
      editor.commands.setContent(content, false);
    }
  }, [editor, content]);

  if (!editor) return null;

  return (
    <div className="text-block-editor">
      {!readonly && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-slate-100 bg-slate-50 rounded-t-md flex-wrap">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold"
          >
            <Bold size={13} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic"
          >
            <Italic size={13} />
          </ToolbarButton>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            <Heading1 size={13} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            <Heading2 size={13} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            <Heading3 size={13} />
          </ToolbarButton>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet list"
          >
            <List size={13} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Numbered list"
          >
            <ListOrdered size={13} />
          </ToolbarButton>
        </div>
      )}
      <EditorContent
        editor={editor}
        className={`tiptap-content px-3 py-2 min-h-[60px] text-sm text-slate-800 focus-within:outline-none ${readonly ? 'bg-slate-50' : 'bg-white'}`}
      />
    </div>
  );
};

interface ToolbarButtonProps {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, active, title, children }) => (
  <button
    type="button"
    onMouseDown={(e) => {
      e.preventDefault(); // Prevent focus loss
      onClick();
    }}
    title={title}
    className={`p-1 rounded transition-colors ${
      active
        ? 'bg-blue-100 text-blue-700'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
    }`}
  >
    {children}
  </button>
);

export default TextBlockEditor;
