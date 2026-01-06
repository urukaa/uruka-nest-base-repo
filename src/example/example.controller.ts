import { Controller} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ExampleService } from "./example.service";

@ApiTags('Example')
@Controller('api/example/')
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}


   
}