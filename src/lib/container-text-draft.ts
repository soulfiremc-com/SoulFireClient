export type ContainerTextDraft = {
  value: string;
  serverValue: string;
  dirty: boolean;
};

export function createContainerTextDraft(value: string): ContainerTextDraft {
  return { value, serverValue: value, dirty: false };
}

export function editContainerTextDraft(
  draft: ContainerTextDraft,
  value: string,
  saving: boolean,
): ContainerTextDraft {
  return { ...draft, value, dirty: saving || value !== draft.serverValue };
}

export function syncContainerTextDraft(
  draft: ContainerTextDraft,
  serverValue: string,
): ContainerTextDraft {
  if (serverValue === draft.serverValue) return draft;
  return {
    serverValue,
    value: draft.dirty ? draft.value : serverValue,
    dirty: draft.dirty && draft.value !== serverValue,
  };
}
