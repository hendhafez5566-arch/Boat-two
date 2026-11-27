import type { ReactNode } from 'react';
import styles from './channels.module.css';
export default function ChannelsLayout({children}:{children:ReactNode}){return <div className={styles.channelSuite} data-channel-suite>{children}</div>;}
