export type ServerInputDraft = {
  value: string;
  serverValue: string;
  dirty: boolean;
};

export function createServerInputDraft(value: string): ServerInputDraft {
  return { value, serverValue: value, dirty: false };
}

export function editServerInputDraft(
  draft: ServerInputDraft,
  value: string,
  saving: boolean,
): ServerInputDraft {
  return { ...draft, value, dirty: saving || value !== draft.serverValue };
}

export function syncServerInputDraft(
  draft: ServerInputDraft,
  serverValue: string,
): ServerInputDraft {
  if (serverValue === draft.serverValue) return draft;
  return {
    serverValue,
    value: draft.dirty ? draft.value : serverValue,
    dirty: draft.dirty && draft.value !== serverValue,
  };
}

export function acknowledgeServerInputDraft(
  draft: ServerInputDraft,
  submittedValue: string,
  serverValue: string,
): ServerInputDraft {
  return draft.value === submittedValue
    ? createServerInputDraft(serverValue)
    : syncServerInputDraft(draft, serverValue);
}
