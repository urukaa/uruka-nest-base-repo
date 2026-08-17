import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { ExampleModule } from '../src/example/example.module';
import { ExampleService } from '../src/example/example.service';

/**
 * ExampleModule is the scaffold to copy for new feature modules. It is not
 * wired into AppModule, so this check exists to prove its dependencies still
 * resolve against the current CommonModule exports.
 */
describe('ExampleModule', () => {
  it('resolves its dependencies', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ExampleModule],
    }).compile();

    await expect(moduleRef.get(ExampleService).staffPosition()).resolves.toBe(
      'hello',
    );
  });
});
