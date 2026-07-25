import { runEducationRepositoryContract } from '../education-repository.contract.js';
import { InMemoryEducationRepository } from './in-memory-education.repository.js';

runEducationRepositoryContract(
  'InMemoryEducationRepository',
  () => new InMemoryEducationRepository(),
);
