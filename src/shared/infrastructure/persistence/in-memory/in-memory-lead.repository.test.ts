import { runLeadRepositoryContract } from '../lead-repository.contract.js';
import { InMemoryLeadRepository } from './in-memory-lead.repository.js';

runLeadRepositoryContract('InMemoryLeadRepository', () => new InMemoryLeadRepository());
