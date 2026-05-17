import { Pipe, PipeTransform } from '@angular/core';
import { TestItem } from '../services/api.service';

@Pipe({ name: 'testsByCategory', standalone: true, pure: true })
export class TestsByCategoryPipe implements PipeTransform {
  transform(tests: TestItem[], category: string): TestItem[] {
    if (!tests || !category) return [];
    return tests.filter(t => t.category === category);
  }
}