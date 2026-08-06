export async function promoteWithRollback({ candidateVersion, previousVersion, promote, validate, rollback }) {
  await promote(candidateVersion);
  try {
    return await validate(candidateVersion);
  } catch (error) {
    await rollback(previousVersion);
    throw error;
  }
}
