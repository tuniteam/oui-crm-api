# 📚 Common API Decorators - Guide d'utilisation

## Vue d'ensemble

Ce dossier contient des décorateurs réutilisables pour standardiser la documentation Swagger et réduire la répétition de code dans les controllers.

## Décorateurs disponibles

### Décorateurs de réponses simples

#### `@ApiGetResponse<T>(type, description?)`
Ajoute les réponses standards pour un endpoint GET :
- ✅ 200 OK
- ❌ 404 Not Found

```typescript
@Get(':id')
@ApiGetResponse(SchoolResponseDto)
async findOne(@Param('id') id: string) { }
```

#### `@ApiPostResponse<T>(type, description?)`
Ajoute les réponses standards pour un endpoint POST :
- ✅ 201 Created
- ❌ 400 Bad Request
- ❌ 409 Conflict

```typescript
@Post()
@ApiPostResponse(SchoolResponseDto, 'School created successfully')
async create(@Body() dto: CreateSchoolDto) { }
```

#### `@ApiPutResponse<T>(type, description?)`
Ajoute les réponses standards pour un endpoint PUT :
- ✅ 200 OK
- ❌ 400 Bad Request
- ❌ 404 Not Found

```typescript
@Put(':id')
@ApiPutResponse(SchoolResponseDto)
async update(@Param('id') id: string, @Body() dto: UpdateSchoolDto) { }
```

#### `@ApiPatchResponse<T>(type?, description?)`
Ajoute les réponses standards pour un endpoint PATCH :
- ✅ 200 OK
- ❌ 400 Bad Request
- ❌ 404 Not Found

```typescript
@Patch(':id/status')
@ApiPatchResponse(SchoolResponseDto)
async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) { }
```

#### `@ApiDeleteResponse(description?)`
Ajoute les réponses standards pour un endpoint DELETE :
- ✅ 204 No Content
- ❌ 404 Not Found

```typescript
@Delete(':id')
@ApiDeleteResponse('School deleted successfully')
async delete(@Param('id') id: string): Promise<void> { }
```

#### `@ApiListResponse<T>(type, description?)`
Ajoute la réponse standard pour un endpoint de liste :
- ✅ 200 OK

```typescript
@Get()
@ApiListResponse(SchoolListResponseDto)
async findAll(@Query() query: QueryDto) { }
```

---

### Décorateurs de paramètres

#### `@ApiUuidParam(name, description, example?)`
Documente un paramètre UUID dans l'URL :

```typescript
@Get(':schoolId')
@ApiUuidParam('schoolId', 'School unique identifier')
async findOne(@Param('schoolId') schoolId: string) { }
```

---

### Décorateurs combinés (Recommandés)

Ces décorateurs combinent paramètre + réponses pour réduire encore plus le boilerplate.

#### `@ApiGetById<T>(paramName, paramDescription, responseType, responseDescription?)`
Combine `@ApiUuidParam` + `@ApiGetResponse` :

```typescript
@Get(':schoolId')
@ApiOperation({ summary: 'Get school by ID' })
@ApiGetById('schoolId', 'School unique identifier', SchoolResponseDto)
async findOne(@Param('schoolId') id: string) { }
```

Équivalent à :
```typescript
@ApiUuidParam('schoolId', 'School unique identifier')
@ApiGetResponse(SchoolResponseDto)
```

#### `@ApiPutById<T>(paramName, paramDescription, responseType, responseDescription?)`
Combine `@ApiUuidParam` + `@ApiPutResponse` :

```typescript
@Put(':schoolId')
@ApiPutById('schoolId', 'School UUID', SchoolResponseDto)
async update(@Param('schoolId') id: string, @Body() dto: UpdateDto) { }
```

#### `@ApiDeleteById(paramName, paramDescription, responseDescription?)`
Combine `@ApiUuidParam` + `@ApiDeleteResponse` :

```typescript
@Delete(':schoolId')
@ApiDeleteById('schoolId', 'School UUID', 'School deleted')
async delete(@Param('schoolId') id: string): Promise<void> { }
```

---

## Exemples d'utilisation

### Avant (répétitif) ❌

```typescript
@Get(':schoolId')
@ApiOperation({ summary: 'Get school' })
@ApiParam({ name: 'schoolId', description: 'School UUID' })
@ApiResponse({ status: 200, type: SchoolResponseDto })
@ApiResponse({ status: 404, description: 'Not found' })
async findOne(@Param('schoolId') id: string) {
  return this.service.findOne(id);
}

@Put(':schoolId')
@ApiOperation({ summary: 'Update school' })
@ApiParam({ name: 'schoolId', description: 'School UUID' })
@ApiResponse({ status: 200, type: SchoolResponseDto })
@ApiResponse({ status: 400, description: 'Bad request' })
@ApiResponse({ status: 404, description: 'Not found' })
async update(@Param('schoolId') id: string, @Body() dto: UpdateDto) {
  return this.service.update(id, dto);
}
```

### Après (concis) ✅

```typescript
@Get(':schoolId')
@ApiOperation({ summary: 'Get school' })
@ApiGetById('schoolId', 'School UUID', SchoolResponseDto)
async findOne(@Param('schoolId') id: string) {
  return this.service.findOne(id);
}

@Put(':schoolId')
@ApiOperation({ summary: 'Update school' })
@ApiPutById('schoolId', 'School UUID', SchoolResponseDto)
async update(@Param('schoolId') id: string, @Body() dto: UpdateDto) {
  return this.service.update(id, dto);
}
```

**Réduction : 8 lignes → 2 lignes** 🎉

---

## Pattern CRUD complet

```typescript
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  ApiGetResponse,
  ApiPostResponse,
  ApiGetById,
  ApiPutById,
  ApiDeleteById,
} from '../common/decorators';

@ApiTags('Schools')
@Controller('schools')
export class SchoolsController {
  constructor(private readonly service: SchoolsService) {}

  // LIST
  @Get()
  @ApiOperation({ summary: 'List schools' })
  @ApiGetResponse(SchoolListResponseDto)
  async findAll(@Query() query: QueryDto) {
    return this.service.findAll(query);
  }

  // READ
  @Get(':id')
  @ApiOperation({ summary: 'Get school' })
  @ApiGetById('id', 'School UUID', SchoolResponseDto)
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // CREATE
  @Post()
  @ApiOperation({ summary: 'Create school' })
  @ApiPostResponse(SchoolResponseDto)
  async create(@Body() dto: CreateSchoolDto) {
    return this.service.create(dto);
  }

  // UPDATE
  @Put(':id')
  @ApiOperation({ summary: 'Update school' })
  @ApiPutById('id', 'School UUID', SchoolResponseDto)
  async update(@Param('id') id: string, @Body() dto: UpdateSchoolDto) {
    return this.service.update(id, dto);
  }

  // DELETE
  @Delete(':id')
  @ApiOperation({ summary: 'Delete school' })
  @ApiDeleteById('id', 'School UUID')
  async delete(@Param('id') id: string): Promise<void> {
    return this.service.delete(id);
  }
}
```

---

## Bonnes pratiques

### ✅ À faire

1. **Utiliser les décorateurs combinés** pour les endpoints simples avec UUID
2. **Toujours ajouter `@ApiOperation`** avec une description claire
3. **Utiliser les types DTOs** corrects pour les réponses
4. **Garder `@ApiTags`** au niveau du controller pour grouper dans Swagger

```typescript
@ApiTags('Schools')  // ← Groupement Swagger
@Controller('schools')
export class SchoolsController {
  @Get(':id')
  @ApiOperation({ summary: 'Get school' })  // ← Description
  @ApiGetById('id', 'School UUID', SchoolResponseDto)  // ← Décorateur combiné
  async findOne(@Param('id') id: string) { }
}
```

### ❌ À éviter

1. **Ne pas dupliquer** les décorateurs `@ApiResponse` manuellement
2. **Ne pas oublier** `@ApiOperation` (requis pour le summary)
3. **Ne pas utiliser `Object`** comme type de réponse (créer un DTO)

---

## Créer vos propres décorateurs

Si vous avez des patterns spécifiques à votre domaine :

```typescript
// src/modules/schools/decorators/api-school-responses.ts
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiSchoolWithClasses() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'School with classes included',
      // Schema custom...
    })
  );
}
```

---

## Migration d'un controller existant

### Étapes

1. Importer les décorateurs :
```typescript
import {
  ApiGetById,
  ApiPutById,
  ApiDeleteById,
} from '../common/decorators';
```

2. Remplacer les blocs `@ApiParam` + `@ApiResponse` par les décorateurs combinés

3. Tester que Swagger affiche correctement

4. Vérifier les tests unitaires (pas d'impact normalement)

---

## Voir aussi

- [Exemple complet](./base/base.controller.example.ts)
- [Documentation NestJS Swagger](https://docs.nestjs.com/openapi/introduction)
