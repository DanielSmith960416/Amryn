/**
 * Where uploaded files live.
 *
 * Its own file because documents.ts carries the `'use server'` marker, and a
 * module with that marker may export nothing but async functions — a constant
 * exported alongside the actions fails the build. The same reason smtp.ts and
 * transport.ts are two files, arriving from the other direction.
 */
export const DOCUMENTS_BUCKET = 'documents';
