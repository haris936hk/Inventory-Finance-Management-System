// ========== src/services/roleService.js ==========
const db = require('../config/database');

class RoleService {
  async getAllRoles() {
    return await db.prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        permissions: true
      },
      orderBy: {
        name: 'asc'
      }
    });
  }

  async getRoleById(id) {
    return await db.prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        permissions: true
      }
    });
  }
}

module.exports = new RoleService();
