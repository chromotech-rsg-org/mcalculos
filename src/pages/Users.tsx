import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import LordIcon from '@/components/ui/lord-icon';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { User, UserRole } from '@/types';

const MAIN_ADMIN_EMAIL = 'admin@mcalculo.com.br';

const Users: React.FC = () => {
  const { currentUser, updateUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const emptyForm = {
    name: '',
    email: '',
    password: '',
    role: 'user' as UserRole,
  };

  const [formData, setFormData] = useState(emptyForm);

  const fetchUsers = async () => {
    if (!isAdmin) return;
    
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: roles } = await supabase.from('user_roles').select('*');
    
    if (!profiles) return;

    // Get emails from edge function
    const { data: authUsers } = await supabase.functions.invoke('list-users');
    const emailMap: Record<string, string> = {};
    if (Array.isArray(authUsers)) {
      authUsers.forEach((u: any) => { emailMap[u.auth_id] = u.email; });
    }

    const userList: User[] = profiles.map(p => {
      const userRoles = roles?.filter(r => r.user_id === p.user_id) || [];
      const role: UserRole = userRoles.some(r => r.role === 'admin') ? 'admin' : 'user';
      return {
        id: p.id,
        user_id: p.user_id,
        name: p.name,
        email: emailMap[p.user_id] || '',
        role,
        created_at: p.created_at,
      };
    });

    setUsers(userList);
  };

  useEffect(() => {
    fetchUsers();
  }, [isAdmin, showModal, deleteDialogOpen]);

  // For regular user - show profile
  useEffect(() => {
    if (!isAdmin && currentUser) {
      setFormData({
        name: currentUser.name || '',
        email: currentUser.email || '',
        password: '',
        role: currentUser.role || 'user',
      });
    }
  }, [isAdmin, currentUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (isAdmin && editingUser) {
      // Admin editing existing user - update profile name
      await supabase.from('profiles').update({ name: formData.name }).eq('user_id', editingUser.user_id);
      
      // Update role if changed (block changes to master admin by other admins)
      const currentRole = editingUser.role;
      if (formData.role !== currentRole) {
        if (editingUser.email === MAIN_ADMIN_EMAIL) {
          toast({ variant: 'destructive', title: 'Erro', description: 'O perfil do administrador master não pode ser alterado.' });
          setIsLoading(false);
          return;
        }
        // Remove old role, add new
        await supabase.from('user_roles').delete().eq('user_id', editingUser.user_id);
        await supabase.from('user_roles').insert({ user_id: editingUser.user_id, role: formData.role });
      }
      
      if (editingUser.user_id === currentUser?.user_id) {
        await updateUser({ name: formData.name });
      }
      
      toast({ title: 'Usuário atualizado!', description: 'As informações foram salvas com sucesso.' });
    } else if (isAdmin && !editingUser) {
      // Admin creating new user via edge function
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { email: formData.email, password: formData.password, name: formData.name, role: formData.role },
      });
      
      if (error) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Erro ao criar usuário.' });
        setIsLoading(false);
        return;
      }

      toast({ title: 'Usuário criado!', description: 'O novo usuário foi cadastrado com sucesso.' });
    } else {
      // Regular user editing own profile
      await updateUser({ name: formData.name });
      toast({ title: 'Perfil atualizado!', description: 'Suas informações foram salvas com sucesso.' });
    }

    setShowModal(false);
    setEditingUser(null);
    setFormData(emptyForm);
    setIsLoading(false);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
    });
    setShowModal(true);
  };

  const openNewUserModal = () => {
    setEditingUser(null);
    setFormData(emptyForm);
    setShowModal(true);
  };

  const confirmDelete = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    
    // Call edge function to delete user
    const { error } = await supabase.functions.invoke('delete-user', {
      body: { userId: userToDelete.user_id },
    });
    
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Erro ao excluir usuário.' });
    } else {
      toast({ title: 'Usuário excluído', description: `${userToDelete.name} foi removido do sistema.` });
    }
    
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const openPasswordDialog = (user?: User) => {
    setPasswordTarget(user || null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordDialogOpen(true);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Erro', description: 'As senhas não coincidem.' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Erro', description: 'A senha deve ter pelo menos 6 caracteres.' });
      return;
    }

    setIsChangingPassword(true);
    const { data, error } = await supabase.functions.invoke('update-password', {
      body: { userId: passwordTarget?.user_id || currentUser?.user_id, newPassword },
    });

    if (error || data?.error) {
      toast({ variant: 'destructive', title: 'Erro', description: data?.error || 'Erro ao alterar senha.' });
    } else {
      toast({ title: 'Senha alterada!', description: 'A senha foi atualizada com sucesso.' });
      setPasswordDialogOpen(false);
    }
    setIsChangingPassword(false);
  };

  const getRoleIcon = (role: UserRole) => {
    return role === 'admin' ? (
      <LordIcon icon="shield" size={16} trigger="loop" delay={5000} colors={{ primary: '#08a88a', secondary: '#3b82f6' }} />
    ) : (
      <LordIcon icon="user" size={16} trigger="hover" colors={{ primary: '#6b7280', secondary: '#6b7280' }} />
    );
  };

  const getRoleLabel = (role: UserRole) => {
    return role === 'admin' ? 'Administrador' : 'Usuário';
  };

  const canDeleteUser = (user: User) => {
    if (user.user_id === currentUser?.user_id) return false;
    if (user.email === MAIN_ADMIN_EMAIL) return false;
    return true;
  };

  // Regular user view
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Meu Perfil</h1>
          <p className="text-muted-foreground mt-1">Gerencie suas informações pessoais</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Informações Pessoais</CardTitle>
            <CardDescription>Atualize seus dados</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input id="name" name="name" value={formData.name} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" value={formData.email} disabled />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isLoading} className="flex-1 gradient-primary text-primary-foreground">
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                  ) : (
                    <><LordIcon icon="save" size={16} trigger="hover" colors={{ primary: '#ffffff', secondary: '#ffffff' }} />Salvar Alterações</>
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => openPasswordDialog()}>
                  Alterar Senha
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin view
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Usuários</h1>
          <p className="text-muted-foreground mt-1">Gerencie os usuários do sistema</p>
        </div>
        <Button onClick={openNewUserModal} className="gradient-primary text-primary-foreground">
          <LordIcon icon="plus" size={16} trigger="hover" colors={{ primary: '#ffffff', secondary: '#ffffff' }} />
          <span className="ml-2">Novo Usuário</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Usuários</CardTitle>
          <CardDescription>{users.length} usuário(s) cadastrado(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.map(user => (
              <div key={user.id} className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                <div className="p-2 rounded-lg bg-primary/10">
                  <LordIcon icon="user" size={20} trigger="loop" delay={4000} colors={{ primary: '#08a88a', secondary: '#3b82f6' }} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{user.name}</p>
                    {getRoleIcon(user.role)}
                    <span className="text-xs text-muted-foreground">{getRoleLabel(user.role)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditModal(user)} title="Editar">
                    <LordIcon icon="edit" size={16} trigger="hover" colors={{ primary: '#121331', secondary: '#08a88a' }} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openPasswordDialog(user)} title="Alterar Senha">
                    <LordIcon icon="lock" size={16} trigger="hover" colors={{ primary: '#121331', secondary: '#f59e0b' }} />
                  </Button>
                  {canDeleteUser(user) && (
                    <Button variant="ghost" size="icon" onClick={() => confirmDelete(user)} title="Excluir">
                      <LordIcon icon="trash" size={16} trigger="hover" colors={{ primary: '#ef4444', secondary: '#ef4444' }} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User Form Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Atualize as informações do usuário' : 'Preencha os dados do novo usuário'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleChange} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} disabled={!!editingUser} required />
            </div>

            {!editingUser && (
              <div className="space-y-2">
                <Label htmlFor="password">Senha *</Label>
                <Input id="password" name="password" type="password" value={formData.password} onChange={handleChange} required minLength={6} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="role">Perfil *</Label>
              <Select value={formData.role} onValueChange={(value: UserRole) => setFormData(prev => ({ ...prev, role: value }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="user">Usuário</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoading} className="gradient-primary text-primary-foreground">
                {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o usuário <strong>{userToDelete?.name}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Change Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
            <DialogDescription>
              {passwordTarget ? `Alterar senha de ${passwordTarget.name}` : 'Digite sua nova senha'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha *</Label>
              <Input id="newPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={6} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha *</Label>
              <Input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={6} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleChangePassword} disabled={isChangingPassword || !newPassword || !confirmPassword} className="gradient-primary text-primary-foreground">
              {isChangingPassword ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Alterando...</> : 'Alterar Senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
