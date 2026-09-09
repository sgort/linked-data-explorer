// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import BpmnProperties from './BpmnProperties';

describe('BpmnProperties', () => {
  test('shows a placeholder when nothing is selected', () => {
    render(<BpmnProperties selectedElement={null} onUpdateElement={vi.fn()} />);
    expect(screen.getByText('Select an element to view properties')).toBeTruthy();
  });

  test('renders the type, id, and name of the selected element', () => {
    render(
      <BpmnProperties
        selectedElement={{ type: 'bpmn:UserTask', id: 'task1', businessObject: { name: 'Review' } }}
        onUpdateElement={vi.fn()}
      />
    );
    expect(screen.getByText('UserTask')).toBeTruthy();
    expect(screen.getByText('task1')).toBeTruthy();
    expect(screen.getByDisplayValue('Review')).toBeTruthy();
  });

  test('falls back to "Unnamed" and "Unknown" when the element lacks type/name', () => {
    render(<BpmnProperties selectedElement={{ id: 'task1' }} onUpdateElement={vi.fn()} />);
    expect(screen.getByText('Unknown')).toBeTruthy();
    expect(screen.getByDisplayValue('Unnamed')).toBeTruthy();
  });

  test('editing the name field calls onUpdateElement', async () => {
    const onUpdateElement = vi.fn();
    render(
      <BpmnProperties
        selectedElement={{ type: 'bpmn:Task', id: 't1', businessObject: { name: 'Task' } }}
        onUpdateElement={onUpdateElement}
      />
    );

    // The input is controlled by the (unchanged) prop value, so each keystroke
    // appends to the original "Task" rather than accumulating locally.
    await userEvent.type(screen.getByPlaceholderText('Element name'), 'x');
    expect(onUpdateElement).toHaveBeenCalledWith({ name: 'Taskx' });
  });

  test('shows the DMN decision-reference section only for a BusinessRuleTask', () => {
    const { rerender } = render(
      <BpmnProperties selectedElement={{ type: 'bpmn:Task', id: 't1' }} onUpdateElement={vi.fn()} />
    );
    expect(screen.queryByText('DMN Decision Reference')).toBeNull();

    rerender(
      <BpmnProperties
        selectedElement={{ type: 'bpmn:BusinessRuleTask', id: 't1' }}
        onUpdateElement={vi.fn()}
      />
    );
    expect(screen.getByText('DMN Decision Reference')).toBeTruthy();
  });
});
