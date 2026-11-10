import { Canvas } from './ui/Canvas.tsx';
import { Inspector } from './ui/Inspector.tsx';
import { Library } from './ui/Library.tsx';
import { PromptBar } from './ui/PromptBar.tsx';
import { Toolbar } from './ui/Toolbar.tsx';
import { useEditorHotkeys } from './ui/useEditorHotkeys.ts';
import './ui/editor.css';

function App() {
  useEditorHotkeys();

  return (
    <div className="editor">
      <Toolbar />
      <PromptBar />
      <Library />
      <Canvas />
      <Inspector />
    </div>
  );
}

export default App;
