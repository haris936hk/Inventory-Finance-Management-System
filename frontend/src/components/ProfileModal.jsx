// ========== src/components/ProfileModal.jsx ==========
import React from 'react';
import { Modal, Descriptions, Avatar, Button, Space, Tag } from 'antd';
import { UserOutlined, EditOutlined, MailOutlined, PhoneOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

const ProfileModal = ({ visible, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const handleEditProfile = () => {
    onClose();
    navigate('/app/profile');
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      'Admin': 'red',
      'Manager': 'blue',
      'Staff': 'green',
      'Viewer': 'default'
    };
    return colors[role] || 'default';
  };

  return (
    <Modal
      title={
        <Space>
          <Avatar
            size={40}
            icon={<UserOutlined />}
            style={{ backgroundColor: '#1890ff' }}
          />
          <span>My Profile</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button
          key="edit"
          type="primary"
          icon={<EditOutlined />}
          onClick={handleEditProfile}
        >
          Edit Profile
        </Button>,
      ]}
      width={600}
    >
      {user && (
        <>
          <Descriptions bordered column={1} style={{ marginTop: 16 }}>
            <Descriptions.Item label="Full Name">
              {user.fullName || '-'}
            </Descriptions.Item>

            <Descriptions.Item label="Username">
              <Space>
                <UserOutlined />
                {user.username}
              </Space>
            </Descriptions.Item>

            {user.email && (
              <Descriptions.Item label="Email">
                <Space>
                  <MailOutlined />
                  {user.email}
                </Space>
              </Descriptions.Item>
            )}

            {user.phone && (
              <Descriptions.Item label="Phone">
                <Space>
                  <PhoneOutlined />
                  {user.phone}
                </Space>
              </Descriptions.Item>
            )}

            <Descriptions.Item label="Role">
              <Space>
                <SafetyOutlined />
                <Tag color={getRoleBadgeColor(user.role?.name || user.role)}>
                  {user.role?.name || user.role}
                </Tag>
              </Space>
            </Descriptions.Item>

            {user.createdAt && (
              <Descriptions.Item label="Member Since">
                {new Date(user.createdAt).toLocaleDateString('en-PK', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </Descriptions.Item>
            )}
          </Descriptions>
        </>
      )}
    </Modal>
  );
};

export default ProfileModal;
