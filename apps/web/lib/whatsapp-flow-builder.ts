export const NATIVE_FLOW_CATEGORIES = [
  'SIGN_UP',
  'SIGN_IN',
  'APPOINTMENT_BOOKING',
  'LEAD_GENERATION',
  'CONTACT_US',
  'CUSTOMER_SUPPORT',
  'SURVEY',
  'OTHER',
] as const;
export type NativeField = {
  id: string;
  type: 'heading' | 'text' | 'textarea' | 'checkbox' | 'radio' | 'select' | 'date';
  label: string;
  required: boolean;
  options: { id: string; title: string }[];
};
export type NativeForm = {
  screenId: string;
  title: string;
  submitLabel: string;
  fields: NativeField[];
};
export function buildNativeFlow(form: NativeForm) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(form.screenId))
    throw new Error(
      'Screen ID must begin with a letter and contain only letters, numbers and underscores',
    );
  if (!form.title.trim() || !form.submitLabel.trim() || !form.fields.length)
    throw new Error('Add a title, submit label and at least one field');
  const ids = new Set<string>();
  const payload: Record<string, string> = {};
  const children: Record<string, unknown>[] = form.fields.map((field) => {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(field.id) || ids.has(field.id))
      throw new Error('Field keys must be unique letters, numbers and underscores');
    ids.add(field.id);
    if (!field.label.trim()) throw new Error('Every field needs a label');
    if (field.type === 'heading') return { type: 'TextHeading', text: field.label };
    payload[field.id] = '${form.' + field.id + '}';
    const component: Record<string, unknown> = {
      type: (
        {
          text: 'TextInput',
          textarea: 'TextArea',
          checkbox: 'CheckboxGroup',
          radio: 'RadioButtonsGroup',
          select: 'Dropdown',
          date: 'DatePicker',
        } as const
      )[field.type],
      name: field.id,
      label: field.label,
      required: field.required,
    };
    if (field.type === 'text') component['input-type'] = 'text';
    if (['checkbox', 'radio', 'select'].includes(field.type)) {
      if (
        !field.options.length ||
        new Set(field.options.map((option) => option.id)).size !== field.options.length ||
        field.options.some((option) => !option.id.trim() || !option.title.trim())
      )
        throw new Error('Choice fields need unique option IDs and labels');
      component['data-source'] = field.options.map((option) => ({ ...option }));
    }
    return component;
  });
  children.push({
    type: 'Footer',
    label: form.submitLabel,
    'on-click-action': { name: 'complete', payload },
  });
  return {
    version: '7.3',
    screens: [
      {
        id: form.screenId,
        title: form.title,
        terminal: true,
        success: true,
        data: {},
        layout: {
          type: 'SingleColumnLayout',
          children: [{ type: 'Form', name: 'form', children }],
        },
      },
    ],
  };
}
export type NativeFlowRow = {
  id: string;
  name: string;
  categories: string[];
  definition: Record<string, unknown> | null;
  provider_id: string | null;
  provider_status: string;
  operation: string | null;
  operation_state: string | null;
  revision: number;
  validation_errors: Record<string, unknown>[];
  error: string | null;
  created_at: string;
  updated_at: string;
};
