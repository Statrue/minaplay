import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { User } from '../../user/user.entity.js';
import { Rule } from '../rule/rule.entity.js';
import { ParseLog } from '../parse-log/parse-log.entity.js';
import { DownloadItem } from '../download/download-item.entity.js';

/** 订阅源 */
@Entity()
export class Source {
  /** id */
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** url */
  @Column({
    type: 'text',
  })
  url: string;

  /** Parser Meta */
  @Exclude()
  @Column({
    nullable: true,
  })
  parserMeta?: string;

  /** 备注 */
  @Column({
    nullable: true,
  })
  remark?: string;

  /** 标题 */
  @Column({
    nullable: true,
  })
  title?: string;

  /** 更新周期 cron 表达式 */
  @Column({
    default: '0 */30 * * * *',
  })
  cron: string;

  /** 是否启用 */
  @Column({
    default: true,
  })
  enabled: boolean;

  /** 规则 */
  @ManyToMany(() => Rule, (rule) => rule.sources, {
    onDelete: 'CASCADE',
  })
  rules: Relation<Promise<Rule[]>>;

  /** 更新记录 */
  @Exclude()
  @OneToMany(() => ParseLog, (log) => log.source)
  logs: Relation<Promise<ParseLog[]>>;

  /** 下载内容 */
  @Exclude()
  @OneToMany(() => DownloadItem, (download) => download.source)
  downloads: Relation<Promise<DownloadItem[]>>;

  /** 创建用户 */
  @ManyToOne(() => User, (user) => user.sources, {
    onDelete: 'SET NULL',
    eager: true,
    nullable: true,
  })
  user?: Relation<User>;

  /** 创建时间 */
  @CreateDateColumn()
  createAt: Date;

  /** 更新时间 */
  @UpdateDateColumn()
  updateAt: Date;
}
