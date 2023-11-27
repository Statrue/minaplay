import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../user/user.entity';
import { Series } from './series.entity';
import { Exclude } from 'class-transformer';

/** 剧集订阅 */
@Entity()
export class SeriesSubscribe {
  /** 用户 */
  @Exclude()
  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  user: User;

  @Exclude()
  @PrimaryColumn()
  userId: number;

  /** 剧集 */
  @Exclude()
  @ManyToOne(() => Series, {
    onDelete: 'CASCADE',
  })
  series: Series;

  @Exclude()
  @PrimaryColumn()
  seriesId: number;

  /** 启用通知 */
  @Column({
    nullable: true,
    default: true,
  })
  notify: boolean;

  /** 创建时间 */
  @CreateDateColumn()
  createAt: Date;
}
