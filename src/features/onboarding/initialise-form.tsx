'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { initialise } from './actions';

export function InitialiseForm({ alreadyDone }: { alreadyDone: boolean }) {
  return (
    <form action={initialise}>
      <Submit alreadyDone={alreadyDone} />
    </form>
  );
}

function Submit({ alreadyDone }: { alreadyDone: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending
        ? 'Building your twin…'
        : alreadyDone
          ? 'Go to the Command Centre'
          : 'Initialise and open the Command Centre'}
    </Button>
  );
}
