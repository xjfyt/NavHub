import { Me, Workspace } from "./types";
import { WorkspaceProvider } from "./hooks/useWorkspace";
import { Shell } from "./components/Shell";

export function WorkspaceScreen(props: {
  me: Me | null;
  workspace: Workspace;
  onReload: () => void;
  onRequestLogin: () => void;
  onLogout: () => void | Promise<void>;
}) {
  const { me, workspace, onRequestLogin, onLogout, onReload } = props;

  return (
    <WorkspaceProvider
      initialMe={me}
      initialWorkspace={workspace}
      onReload={onReload}
    >
      <Shell onLogout={onLogout} onRequestLogin={onRequestLogin} />
    </WorkspaceProvider>
  );
}
