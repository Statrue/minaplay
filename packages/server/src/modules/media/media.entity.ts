import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { File } from '../file/file.entity';
import { DownloadItem } from '../subscribe/download-item.entity';

@Entity()
export class Media {
  /** id */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 标题 */
  @Column()
  name: string;

  /** 简介 */
  @Column({
    type: 'text',
    nullable: true,
  })
  description?: string;

  /** 是否公开 */
  @Exclude()
  @Column({
    default: true,
  })
  isPublic: boolean;

  /** 下载项目 */
  @Exclude()
  @ManyToOne(() => DownloadItem, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  download?: DownloadItem;

  /** 封面图片 */
  @ManyToOne(() => File, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  poster?: File;

  /**对应文件 */
  @ManyToOne(() => File, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  file?: File;

  /** 创建时间 */
  @CreateDateColumn()
  createAt: Date;

  /** 更新时间 */
  @UpdateDateColumn()
  updateAt: Date;

  /** 删除时间 */
  @Exclude()
  @DeleteDateColumn()
  deleteAt: Date;
}
