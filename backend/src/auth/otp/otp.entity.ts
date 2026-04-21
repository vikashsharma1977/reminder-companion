import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index,
} from 'typeorm';

@Entity('otps')
export class OtpEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  target: string; // email address or phone number

  @Column({ type: 'varchar' })
  type: 'email' | 'phone' | 'password-reset';

  @Column()
  code: string;

  @Column()
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  // #4 — Lockout after 5 failed verify attempts
  @Column({ default: 0 })
  attempts: number;

  @CreateDateColumn()
  createdAt: Date;
}
